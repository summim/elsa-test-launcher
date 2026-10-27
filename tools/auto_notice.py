"""모드·리소스팩·런처가 바뀌면 런처 공지(launcher-data/notices.json)를 자동으로 쓴다.

sync_mods.py 가 목록을 다시 만들기 전후로 snapshot() 을 찍고, announce() 로 차이를 공지로 남긴다.
- 같은 날 자동 공지가 이미 있으면 거기에 합친다. (짧은 시간에 여러 번 고쳐도 공지가 쌓이지 않게)
- 사람이 직접 쓴 공지는 건드리지 않는다.
"""
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NOTICES = ROOT / "launcher-data" / "notices.json"
LAUNCHER = ROOT / "launcher-data" / "launcher.json"
ANNOUNCED = ROOT / "launcher-data" / "announced.json"
KST = dt.timezone(dt.timedelta(hours=9))
MAX_NOTICES = 40

FOLDER_NAMES = {"resourcepacks": "리소스팩", "shaderpacks": "쉐이더팩", "config": "게임 설정 파일"}
ACTION_ORDER = ["추가", "업데이트", "삭제"]


def _toml_value(text: str, key: str) -> str | None:
    m = re.search(rf'^{key}\s*=\s*"((?:[^"\\]|\\.)*)"', text, re.M)
    return json.loads(f'"{m.group(1)}"') if m else None


def snapshot() -> dict:
    mods = {}
    for p in list((ROOT / "mods").glob("*.pw.toml")) + list((ROOT / "resourcepacks").glob("*.pw.toml")):
        t = p.read_text(encoding="utf-8")
        mods[p.parent.name + "/" + p.name] = {
            "kind": "리소스팩" if p.parent.name == "resourcepacks" else "모드",
            "name": _toml_value(t, "name") or p.stem,
            "filename": _toml_value(t, "filename") or "",
            "hash": _toml_value(t, "hash") or "",
        }
    files = {}
    index = ROOT / "index.toml"
    if index.exists():
        for block in index.read_text(encoding="utf-8").split("[[files]]")[1:]:
            f = _toml_value(block, "file")
            if f and "metafile = true" not in block and f.split("/")[0] in FOLDER_NAMES:
                files[f] = _toml_value(block, "hash") or ""
    return {"mods": mods, "files": files}


def _changes(before: dict, after: dict) -> list[tuple[str, str, str]]:
    """(분류, 동작, 이름) 목록"""
    out = []
    bm, am = before["mods"], after["mods"]
    kind = lambda m: m.get("kind", "모드")  # noqa: E731
    for k in am.keys() - bm.keys():
        out.append((kind(am[k]), "추가", am[k]["name"]))
    for k in bm.keys() - am.keys():
        out.append((kind(bm[k]), "삭제", bm[k]["name"]))
    for k in am.keys() & bm.keys():
        if (am[k]["filename"], am[k]["hash"]) != (bm[k]["filename"], bm[k]["hash"]):
            out.append((kind(am[k]), "업데이트", am[k]["name"]))
    bf, af = before["files"], after["files"]
    for f in sorted(af.keys() | bf.keys()):
        if f.endswith("elsa-version.txt"):
            continue  # 자동 업데이트 확인용 파일은 공지하지 않음
        kind = FOLDER_NAMES[f.split("/")[0]]
        name = f.split("/")[-1]
        if f not in bf:
            out.append((kind, "추가", name))
        elif f not in af:
            out.append((kind, "삭제", name))
        elif af[f] != bf[f]:
            out.append((kind, "업데이트", name))
    return out


def _load() -> list:
    try:
        data = json.loads(NOTICES.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else data.get("notices", [])
    except FileNotFoundError:
        return []


def _save(notices: list) -> None:
    NOTICES.parent.mkdir(exist_ok=True)
    NOTICES.write_text(json.dumps(notices[:MAX_NOTICES], ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def _title(items: list[dict]) -> str:
    kinds = []
    for it in items:
        if it["kind"] not in kinds:
            kinds.append(it["kind"])
    if len(items) == 1:
        it = items[0]
        return f"{it['kind']} {it['action']}: {it['name']}"
    if len(kinds) == 1:
        names = ", ".join(dict.fromkeys(it["name"] for it in items))
        if len(names) <= 28:
            return f"{kinds[0]} 업데이트: {names}"
        return f"{kinds[0]} {len(items)}개 업데이트"
    return "·".join(kinds) + " 업데이트"


def _body(items: list[dict]) -> str:
    lines = []
    for action in ACTION_ORDER:
        names = [f"{it['name']}({it['kind']})" if it["kind"] != "모드" else it["name"] for it in items if it["action"] == action]
        if names:
            lines.append(f"{action}: " + ", ".join(dict.fromkeys(names)))
    lines.append("")
    lines.append("게임을 껐다가 런처에서 다시 시작하면 자동으로 적용돼요.")
    return "\n".join(lines)


def announce(before: dict, after: dict) -> list[str]:
    """바뀐 내용을 공지로 남기고, 남긴 공지 제목 목록을 돌려준다."""
    now = dt.datetime.now(KST)
    today = now.strftime("%Y-%m-%d")
    notices = _load()
    written = []

    changes = _changes(before, after)
    if changes:
        target = next((n for n in notices if n.get("auto") == "files" and n.get("date") == today), None)
        items = list(target.get("items", [])) if target else []
        for kind, action, name in changes:
            # 같은 항목이 다시 바뀌면 마지막 동작으로 덮어쓴다 (추가 후 업데이트 → 추가 유지)
            old = next((it for it in items if it["kind"] == kind and it["name"] == name), None)
            if old:
                if not (old["action"] == "추가" and action == "업데이트"):
                    old["action"] = action
            else:
                items.append({"kind": kind, "action": action, "name": name})
        notice = {
            "date": today,
            "title": _title(items),
            "tag": "자동 업데이트",
            "body": _body(items),
            "auto": "files",
            "items": items,
            "updated": now.strftime("%H:%M"),
        }
        if target:
            notices.remove(target)
        notices.insert(0, notice)
        written.append(notice["title"])

    # 런처 새 버전
    try:
        launcher = json.loads(LAUNCHER.read_text(encoding="utf-8"))
        announced = json.loads(ANNOUNCED.read_text(encoding="utf-8")) if ANNOUNCED.exists() else {}
        ver = str(launcher.get("version", ""))
        if ver and announced.get("launcher") != ver:
            if announced.get("launcher"):  # 처음 한 번은 기준만 저장
                body = (launcher.get("notes") or "").strip()
                body = (body + "\n\n" if body else "") + "런처를 켜면 아래쪽에 새 버전 알림이 떠요. 받아서 예전 폴더 대신 쓰면 돼요."
                notice = {"date": today, "title": f"런처 {ver} 버전이 나왔어요", "tag": "런처", "body": body, "auto": "launcher"}
                notices.insert(0, notice)
                written.append(notice["title"])
            announced["launcher"] = ver
            ANNOUNCED.write_text(json.dumps(announced, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    except FileNotFoundError:
        pass

    if written:
        _save(notices)
    return written
