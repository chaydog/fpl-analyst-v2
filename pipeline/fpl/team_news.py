"""Scrape team news from football news sources.

Strategy:
1. Pull RSS feeds from Sky Sports, Guardian, BBC
2. Filter articles with team news / injury keywords in title
3. Fetch full article text
4. Match player names against FPL database
5. Extract status signals (injury, doubt, expected to start, ruled out)
"""

import re
import requests
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

# Common words that are also player surnames - skip these to reduce false positives
AMBIGUOUS_NAMES = {
    "king", "white", "hall", "anthony", "james", "young", "brown", "hill",
    "smith", "jones", "wood", "stone", "stones", "gray", "wilson", "silva",
    "adam", "daniel", "alexander", "martin", "lewis", "miller", "walker",
    "robinson", "evans", "carter", "rose", "wright", "diop", "moore",
    "peacock", "page", "knight", "ward", "henderson", "anderson", "pope",
    "butler", "russell", "taylor", "baker", "harvey", "owen", "scott",
    "bradley", "jackson", "roberts", "diallo", "lopez", "maria", "luis",
    "lee", "philip", "bowen", "mcatee", "williams",  # too common or live match context
}

RSS_FEEDS = [
    ("Sky Sports", "https://www.skysports.com/rss/12040"),
    ("Guardian", "https://www.theguardian.com/football/premierleague/rss"),
    ("BBC Sport", "http://feeds.bbci.co.uk/sport/football/premier-league/rss.xml"),
]

# Keywords that suggest team news / injury info
KEYWORDS = [
    "team news", "injury", "injured", "fitness", "doubt", "suspended",
    "ruled out", "return", "lineup", "line-up", "absent", "illness",
]

# Status patterns to extract
STATUS_PATTERNS = [
    (r"ruled out|unavailable|will miss|sidelined|out for", "ruled_out"),
    (r"doubt|doubtful|uncertain|race against time|late fitness", "doubtful"),
    (r"injury|injured|knock|strain|sprain|pulled|tear", "injured"),
    (r"suspended|suspension|banned|red card", "suspended"),
    (r"expected to start|should start|set to start|likely to start|in line to start", "expected_start"),
    (r"returns|return to|back from injury|available again|fit again", "returning"),
    (r"rest|rested|rotation|rotated", "rotation_risk"),
]


def fetch_rss(url: str) -> list[dict]:
    """Fetch and parse an RSS feed."""
    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        print(f"  RSS fetch failed for {url}: {e}")
        return []

    try:
        root = ET.fromstring(resp.content)
    except ET.ParseError:
        return []

    items = []
    # Handle both RSS 2.0 and Atom
    for item in root.iter():
        if not item.tag.endswith("item") and not item.tag.endswith("entry"):
            continue

        title = ""
        link = ""
        pub_date = ""
        description = ""

        for child in item:
            tag = child.tag.split("}")[-1]  # strip namespace
            if tag == "title":
                title = (child.text or "").strip()
            elif tag == "link":
                link = (child.text or child.get("href", "") or "").strip()
            elif tag in ("pubDate", "published", "updated"):
                pub_date = (child.text or "").strip()
            elif tag in ("description", "summary"):
                description = (child.text or "").strip()

        if title and link:
            items.append({
                "title": title,
                "link": link,
                "pub_date": pub_date,
                "description": description,
            })

    return items


def is_relevant(article: dict) -> bool:
    """Check if article mentions team news or injuries."""
    text = (article["title"] + " " + article.get("description", "")).lower()
    return any(kw in text for kw in KEYWORDS)


def fetch_article_text(url: str) -> str:
    """Fetch article body text (plain extraction)."""
    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
        resp.raise_for_status()
    except Exception:
        return ""

    html = resp.text
    # Strip scripts and styles
    html = re.sub(r"<script.*?</script>", "", html, flags=re.DOTALL)
    html = re.sub(r"<style.*?</style>", "", html, flags=re.DOTALL)
    # Extract paragraphs
    paragraphs = re.findall(r"<p[^>]*>(.*?)</p>", html, flags=re.DOTALL)
    text = " ".join(re.sub(r"<[^>]+>", "", p) for p in paragraphs)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_player_mentions(text: str, player_names: list[str]) -> list[dict]:
    """Find player mentions in text with TIGHT status association.

    Only captures mentions where a status is close to the player name,
    using structured patterns to reduce false positives.
    """
    mentions = []
    text_lower = text.lower()

    # Very tight patterns: player name followed by status info in close proximity
    tight_patterns = [
        # "Saka (knock - 75% chance)"
        (r"({name})\s*\([^)]*?\b(knock|knee|ankle|hamstring|calf|groin|injury|injured|doubt|surgery|thigh|muscle)[^)]*?\)", "injured"),
        # "Saka is a doubt"
        (r"({name})\s+is\s+(?:a\s+)?doubt", "doubtful"),
        # "Saka is out"
        (r"({name})\s+is\s+(?:set\s+to\s+be\s+)?(?:ruled\s+)?out", "ruled_out"),
        # "Saka is injured"
        (r"({name})\s+is\s+injured", "injured"),
        # "Saka will miss"
        (r"({name})\s+(?:will|could|may)\s+miss", "ruled_out"),
        # "Saka returns from injury"
        (r"({name})\s+(?:has\s+)?returns?(?:\s+from)?(?:\s+\w+){0,3}\s+injury", "returning"),
        # "Saka is fit again" / "Saka is fit"
        (r"({name})\s+is\s+(?:back\s+|fully\s+)?(?:fit|available)", "returning"),
        # "Saka suspended" / "Saka is suspended"
        (r"({name})\s+(?:is\s+)?(?:suspended|banned)", "suspended"),
        # "Injured: Saka" - list format
        (r"\b(?:injured|out|absent|ruled\s+out):\s*[^.]*?\b({name})\b", "ruled_out"),
        (r"\b(?:doubt|doubtful):\s*[^.]*?\b({name})\b", "doubtful"),
        (r"\b(?:suspended|banned):\s*[^.]*?\b({name})\b", "suspended"),
        # "Saka ($injury, return date)" -- FPL Scout style
        (r"({name})\s*\(\w+,\s*\w+\)", "injured"),
    ]

    found = {}  # name -> mention (dedupe)

    for name in player_names:
        # Skip too short and ambiguous names
        if len(name) < 5:
            continue
        if name.lower() in AMBIGUOUS_NAMES:
            continue

        name_escaped = re.escape(name)
        for pattern_template, status in tight_patterns:
            pattern = pattern_template.replace("{name}", name_escaped)
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                start = max(0, match.start() - 80)
                end = min(len(text), match.end() + 80)
                context = text[start:end].strip()

                if name not in found:
                    found[name] = {
                        "player_name": name,
                        "context": context,
                        "statuses": [status],
                    }
                else:
                    if status not in found[name]["statuses"]:
                        found[name]["statuses"].append(status)

    return list(found.values())


def scrape_team_news(player_names: list[str], hours_back: int = 72) -> list[dict]:
    """Main entry point: scrape all feeds, return relevant player news."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours_back)
    all_mentions = []

    for source, url in RSS_FEEDS:
        print(f"  Fetching {source}...")
        articles = fetch_rss(url)
        relevant = [a for a in articles if is_relevant(a)]
        print(f"    {len(articles)} articles, {len(relevant)} relevant")

        for article in relevant[:5]:  # cap at 5 per source to avoid rate limits
            text = fetch_article_text(article["link"])
            if not text:
                continue

            mentions = extract_player_mentions(text, player_names)
            for m in mentions:
                m["source"] = source
                m["article_title"] = article["title"]
                m["article_url"] = article["link"]
                all_mentions.append(m)

    return all_mentions


def summarise_mentions(mentions: list[dict]) -> dict:
    """Deduplicate and summarise mentions per player."""
    by_player = {}
    for m in mentions:
        name = m["player_name"]
        if name not in by_player:
            by_player[name] = {
                "player_name": name,
                "statuses": set(),
                "sources": [],
            }
        by_player[name]["statuses"].update(m["statuses"])
        by_player[name]["sources"].append({
            "source": m["source"],
            "title": m["article_title"],
            "url": m["article_url"],
            "context": m["context"][:200],
        })

    # Convert sets to lists, determine primary status
    priority = ["ruled_out", "suspended", "injured", "doubtful", "rotation_risk", "returning", "expected_start"]
    result = {}
    for name, data in by_player.items():
        primary = None
        for p in priority:
            if p in data["statuses"]:
                primary = p
                break
        result[name] = {
            "player_name": name,
            "primary_status": primary,
            "all_statuses": list(data["statuses"]),
            "sources": data["sources"][:3],  # top 3 sources
        }

    return result
