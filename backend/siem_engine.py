import re
import shlex
from collections import Counter
from datetime import timedelta
from core import now

ALIASES = {"eventid": "event_id", "eventcode": "event_id", "computer": "host", "devicename": "host", "account": "user", "targetusername": "user",
           "userprincipalname": "user", "accountname": "user", "ipaddress": "src_ip", "sourceip": "src_ip", "src": "src_ip", "clientip": "src_ip", "cip": "src_ip", "c_ip": "src_ip",
           "destinationip": "dest_ip", "dest": "dest_ip", "remoteip": "dest_ip", "destinationport": "dest_port", "remoteport": "dest_port", "name": "query", "queryname": "query",
           "querytype": "record_type", "commandline": "command_line", "processcommandline": "command_line", "filename": "process", "image": "process", "newprocessname": "process",
           "parentprocessname": "parent_process", "parentimage": "parent_process", "initiatingprocessfilename": "parent_process", "location": "country", "csuristem": "uri",
           "cs_uri_stem": "uri", "csuriquery": "uri_query", "cs_uri_query": "uri_query", "csmethod": "method", "scstatus": "status", "sc_status": "status", "csuseragent": "user_agent",
           "cs_user_agent": "user_agent", "requesturl": "url", "resulttype": "result_code", "sentbytes": "bytes_out", "bytes": "bytes_out", "appdisplayname": "app",
           "servicename": "service", "ticketencryptiontype": "ticket_encryption", "scriptblocktext": "script_block", "operation": "operation", "timegenerated": "_time", "timestamp": "_time"}
KQL_TABLES = {"securityevent": "wineventlog", "event": "wineventlog", "sysmonevent": "sysmon", "deviceprocessevents": "sysmon", "deviceevents": "sysmon",
              "signinlogs": "azuread", "aadsignineventsbeta": "azuread", "officeactivity": "o365", "dnsevents": "dns", "commonsecuritylog": "firewall",
              "devicenetworkevents": "firewall", "w3ciislog": "web", "proxylogs": "proxy", "vpnlogs": "auth"}
SPL_INDEX = {"windows": "wineventlog", "wineventlog": "wineventlog", "sysmon": "sysmon", "azuread": "azuread", "o365": "o365", "dns": "dns", "firewall": "firewall",
             "proxy": "proxy", "web": "web", "vpn": "auth", "auth": "auth"}
FIELDS = ["sourcetype", "host", "user", "event_id", "src_ip", "dest_ip", "action", "process", "parent_process", "query", "country", "uri", "status"]


class QueryError(Exception):
    pass


def fld(name):
    n = name.lower().strip()
    return ALIASES.get(n, n)


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def compare(val, op, v):
    a, b = num(val), num(v)
    if a is None or b is None:
        return False
    return {">": a > b, "<": a < b, ">=": a >= b, "<=": a <= b}[op]


def match(e, tok):
    m = re.match(r"^([a-z_.]+)(!=|>=|<=|=|>|<)(.+)$", tok, re.I)
    if m:
        f, op, v = fld(m.group(1)), m.group(2), m.group(3).strip('"').lower()
        val = str(e.get(f, "")).lower()
        if op in (">", "<", ">=", "<="):
            return compare(e.get(f), op, v)
        hit = re.match("^" + re.escape(v).replace("\\*", ".*") + "$", val, re.S) is not None
        return hit if op == "=" else not hit
    t = tok.lower().strip("*")
    return any(t in str(v).lower() for v in e.values())


def rel_start(spec):
    m = re.match(r"^-?(\d+)([mhd])", spec.strip().lower())
    if not m:
        return None
    n, u = int(m.group(1)), m.group(2)
    return (now() - timedelta(**{{"m": "minutes", "h": "hours", "d": "days"}[u]: n})).isoformat()


def split_pipes(q):
    out, cur, quote = [], "", None
    for ch in q:
        if ch in "\"'" and (quote is None or quote == ch):
            quote = None if quote else ch
        if ch == "|" and not quote:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    out.append(cur)
    return [s.strip() for s in out]


def parse_spl(q):
    segs = split_pipes(q)
    try:
        toks = [t for t in shlex.split(segs[0]) if t.upper() not in ("AND", "SEARCH")]
    except ValueError:
        toks = segs[0].split()
    preds, start, ops = [], None, []
    i = 0
    while i < len(toks):
        t = toks[i]
        low = t.lower()
        if low.startswith("index="):
            idx = low[6:]
            if idx not in ("*", "main") and idx in SPL_INDEX:
                st = SPL_INDEX[idx]
                preds.append(lambda e, st=st: e.get("sourcetype") == st)
        elif low.startswith("earliest="):
            start = rel_start(low[9:]) or start
        elif low.startswith("latest="):
            pass
        elif t.upper() == "OR" and preds and i + 1 < len(toks):
            prev, nxt = preds.pop(), toks[i + 1]
            preds.append(lambda e, a=prev, b=nxt: a(e) or match(e, b))
            i += 1
        elif t.upper() == "NOT" and i + 1 < len(toks):
            nxt = toks[i + 1]
            preds.append(lambda e, b=nxt: not match(e, b))
            i += 1
        else:
            preds.append(lambda e, t=t: match(e, t))
        i += 1
    for s in segs[1:]:
        m = re.match(r"^(stats|top)\s+(?:count\s+)?(?:by\s+)?(.+)$", s, re.I)
        if m:
            ops.append(("stats", [fld(x) for x in re.split(r"[,\s]+", m.group(2)) if x and x.lower() != "by"]))
            continue
        m = re.match(r"^(table|fields)\s+(.+)$", s, re.I)
        if m:
            ops.append(("table", [fld(x) for x in re.split(r"[,\s]+", m.group(2)) if x and x != "+"]))
            continue
        m = re.match(r"^(head|tail)\s*(\d*)$", s, re.I)
        if m:
            ops.append((m.group(1).lower(), int(m.group(2) or 10)))
            continue
        m = re.match(r"^sort\s+(?:0\s+)?([+-]?)(\w+)$", s, re.I)
        if m:
            ops.append(("sort", fld(m.group(2)), m.group(1) == "-"))
            continue
        m = re.match(r"^dedup\s+(\w+)$", s, re.I)
        if m:
            ops.append(("dedup", fld(m.group(1))))
            continue
        m = re.match(r"^(where|search)\s+(.+)$", s, re.I)
        if m:
            for t in re.split(r"\s+AND\s+", m.group(2), flags=re.I):
                t = re.sub(r"\s*(!=|>=|<=|==|=|>|<)\s*", lambda x: "=" if x.group(1) == "==" else x.group(1), t.strip())
                preds.append(lambda e, t=t: match(e, t))
            continue
        raise QueryError(f"Unsupported SPL command: '{s.split()[0] if s else '|'}'. Try stats, table, head, sort, dedup, where.")
    return preds, start, ops


def kql_cond(c):
    c = c.strip()
    if c.startswith("(") and c.endswith(")"):
        c = c[1:-1].strip()
    if re.search(r"\s+or\s+", c, re.I):
        parts = [kql_cond(x) for x in re.split(r"\s+or\s+", c, flags=re.I)]
        return lambda e: any(p(e) for p in parts)
    m = re.match(r"^(\w+)\s*(>|>=)\s*ago\((\d+[mhd])\)$", c, re.I)
    if m and fld(m.group(1)) == "_time":
        s = rel_start(m.group(3))
        return lambda e: e["_time"] >= s
    m = re.match(r"^(\*|\w+)\s+(!?has_any|!?has|!?contains|startswith|endswith|in~|!in~|!in|in|=~|!~|==|!=|>=|<=|>|<)\s*(.+)$", c, re.I) or \
        re.match(r"^(\*|\w+)\s*(=~|!~|==|!=|>=|<=|>|<)\s*(.+)$", c, re.I)
    if not m:
        raise QueryError(f"Could not parse condition: '{c}'")
    f, op, raw = m.group(1), m.group(2).lower(), m.group(3).strip()
    vals = [v.strip().strip("\"'").lower() for v in raw.strip("()").split(",")] if op.lstrip("!").startswith(("in", "has_any")) else [raw.strip("\"'").lower()]
    v = vals[0]

    def get(e):
        return " ".join(str(x) for x in e.values()).lower() if f == "*" else str(e.get(fld(f), "")).lower()
    neg = op.startswith("!") and op not in ("!=", "!~")
    base = op.lstrip("!") if neg else op
    tests = {"==": lambda s: s == v, "=~": lambda s: s == v, "!=": lambda s: s != v, "!~": lambda s: s != v,
             "has": lambda s: v in s, "contains": lambda s: v in s, "startswith": lambda s: s.startswith(v), "endswith": lambda s: s.endswith(v),
             "in": lambda s: s in vals, "in~": lambda s: s in vals, "has_any": lambda s: any(x in s for x in vals)}
    if base in (">", "<", ">=", "<="):
        return lambda e: compare(e.get(fld(f)), base, v)
    t = tests[base]
    return (lambda e: not t(get(e))) if neg else (lambda e: t(get(e)))


def parse_kql(q):
    segs = split_pipes(q)
    preds, start, ops = [], None, []
    head = segs[0]
    m = re.match(r'^search\s+"?([^"]+)"?$', head, re.I)
    if m:
        preds.append(lambda e, t=m.group(1): match(e, t))
    elif head and head != "*":
        st = KQL_TABLES.get(head.lower())
        if not st:
            raise QueryError(f"Unknown table '{head}'. Try: SecurityEvent, SigninLogs, DeviceProcessEvents, DnsEvents, CommonSecurityLog, W3CIISLog, OfficeActivity.")
        preds.append(lambda e, st=st: e.get("sourcetype") == st)
    for s in segs[1:]:
        m = re.match(r"^where\s+(.+)$", s, re.I)
        if m:
            preds.extend(kql_cond(c) for c in re.split(r"\s+and\s+", m.group(1), flags=re.I))
            continue
        m = re.match(r'^search\s+"?([^"]+)"?$', s, re.I)
        if m:
            preds.append(lambda e, t=m.group(1): match(e, t))
            continue
        m = re.match(r"^summarize\s+.*?\bby\s+(.+)$", s, re.I)
        if m:
            ops.append(("stats", [fld(x) for x in m.group(1).split(",") if x.strip() and not x.strip().lower().startswith("bin(")]))
            continue
        m = re.match(r"^(project|distinct)\s+(.+)$", s, re.I)
        if m:
            cols = [fld(x) for x in m.group(2).split(",") if x.strip()]
            if m.group(1).lower() == "distinct":
                ops.append(("stats", cols))
            else:
                ops.append(("table", cols))
            continue
        m = re.match(r"^(take|limit|top)\s+(\d+)", s, re.I)
        if m:
            ops.append(("head", int(m.group(2))))
            continue
        m = re.match(r"^(sort|order)\s+by\s+(\w+)\s*(asc|desc)?$", s, re.I)
        if m:
            ops.append(("sort", fld(m.group(2)), (m.group(3) or "desc").lower() == "desc"))
            continue
        raise QueryError(f"Unsupported KQL operator: '{s.split()[0] if s else '|'}'. Try where, summarize, project, take, sort by, distinct.")
    return preds, start, ops


def timeline(events):
    c = Counter(e["_time"][:13] for e in events)
    return [{"t": k, "c": v} for k, v in sorted(c.items())]


def run(logs, q, lang="spl", start="", end=""):
    preds, qstart, ops = (parse_kql if lang == "kql" else parse_spl)(q.strip())
    start = max(filter(None, [start, qstart]), default="")
    res = [e for e in logs if (not start or e["_time"] >= start) and (not end or e["_time"] <= end) and all(p(e) for p in preds)]
    total, tl = len(res), timeline(res)
    res = list(reversed(res))
    stats = columns = None
    for op in ops:
        if op[0] == "stats":
            cnt = Counter(" · ".join(str(e.get(f, "-")) for f in op[1]) for e in res)
            stats = {"field": " · ".join(op[1]), "rows": [{"value": k, "count": v} for k, v in cnt.most_common(50)]}
        elif op[0] == "table":
            columns = op[1]
        elif op[0] == "head":
            res = res[:op[1]]
            if stats:
                stats["rows"] = stats["rows"][:op[1]]
        elif op[0] == "tail":
            res = res[-op[1]:]
        elif op[0] == "sort":
            f, desc = op[1], op[2]
            if stats and f in ("count", "count_", "_count"):
                stats["rows"].sort(key=lambda r: r["count"], reverse=desc)
            else:
                res.sort(key=lambda e: (num(e.get(f)) if num(e.get(f)) is not None else str(e.get(f, ""))) if f != "_time" else e["_time"], reverse=desc)
        elif op[0] == "dedup":
            seen, out = set(), []
            for e in res:
                if e.get(op[1]) not in seen:
                    seen.add(e.get(op[1]))
                    out.append(e)
            res = out
    fields = {}
    for f in FIELDS:
        c = Counter(str(e[f]) for e in res if f in e)
        if c:
            fields[f] = [{"value": k, "count": v} for k, v in c.most_common(8)]
    return {"total": total, "events": res[:300], "fields": fields, "stats": stats, "columns": columns, "timeline": tl, "lang": lang}
