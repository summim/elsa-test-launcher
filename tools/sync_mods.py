#!/usr/bin/env python3
"""mods.txt에 적힌 모드 목록으로 packwiz 파일(mods/*.pw.toml, index.toml, pack.toml)을 다시 만든다.

- mods.txt: 한 줄에 Modrinth 주소 이름(slug) 하나. '#' 뒤는 메모.
- 각 모드는 pack.toml의 마인크래프트 버전 + Fabric 용 최신 release(없으면 beta) 버전을 고른다.
- custom-mods/*.jar: Modrinth 에 없는 직접 만든 Fabric 모드. GitHub 주소로 내려받게 등록한다.
- 결과는 sync_report.md 에 적는다. 하나라도 실패하면 종료 코드 1.

필요한 것: 파이썬 3.9 이상, 인터넷(api.modrinth.com). 추가 설치 없음.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = "https://api.modrinth.com/v2"
REPO = "summim/elsa-test-launcher"
UA = {"User-Agent": "summim/elsa-test-launcher (packwiz sync)"}


def get(url: str):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def toml_str(s: str) -> str:
    return json.dumps(s, ensure_ascii=False)


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def read_pack_versions() -> tuple[str, str]:
    text = (ROOT / "pack.toml").read_text(encoding="utf-8")
    mc = re.search(r'^minecraft\s*=\s*"([^"]+)"', text, re.M).group(1)
    fabric = re.search(r'^fabric\s*=\s*"([^"]+)"', text, re.M).group(1)
    return mc, fabric


def read_mod_list() -> list[str]:
    slugs = []
    for line in (ROOT / "mods.txt").read_text(encoding="utf-8").splitlines():
        s = line.split("#", 1)[0].strip()
        if s and s not in slugs:
            slugs.append(s)
    return slugs


def pick_version(slug: str, mc: str):
    q = urllib.parse.urlencode({"loaders": '["fabric"]', "game_versions": json.dumps([mc])})
    versions = get(f"{API}/project/{urllib.parse.quote(slug)}/version?{q}")
    for kind in ("release", "beta"):
        for v in versions:
            if v["version_type"] == kind:
                return v
    return None


def main() -> int:
    mc, _ = read_pack_versions()
    mc_version = mc
    mods_dir = ROOT / "mods"
    mods_dir.mkdir(exist_ok=True)

    report = [f"# 모드 동기화 결과\n\n마인크래프트 {mc} / Fabric\n"]
    ok, failed, warn = [], [], []
    wanted, done_ids = list(read_mod_list()), set()
    written: set[str] = set()

    while wanted:
        slug = wanted.pop(0)
        try:
            proj = get(f"{API}/project/{urllib.parse.quote(slug)}")
        except Exception as e:  # noqa: BLE001
            failed.append(f"`{slug}`: 모드를 찾을 수 없어요 ({e})")
            continue
        if proj["id"] in done_ids:
            continue
        done_ids.add(proj["id"])

        v = pick_version(proj["slug"], mc)
        if v is None:
            failed.append(f"`{slug}` ({proj['title']}): 마인크래프트 {mc} Fabric 버전이 없어요")
            continue
        f = next((x for x in v["files"] if x["primary"]), v["files"][0])

        if proj.get("server_side") == "required":
            warn.append(f"`{slug}` ({proj['title']}): 서버에도 설치가 필요한 모드라 Paper 서버에서는 제대로 작동하지 않을 수 있어요")

        side = "client" if proj.get("server_side") == "unsupported" else "both"
        name = f"{proj['slug']}.pw.toml"
        (mods_dir / name).write_text(
            "\n".join([
                f"name = {toml_str(proj['title'])}",
                f"filename = {toml_str(f['filename'])}",
                f'side = "{side}"',
                "",
                "[download]",
                f"url = {toml_str(f['url'])}",
                'hash-format = "sha512"',
                f"hash = {toml_str(f['hashes']['sha512'])}",
                "",
                "[update]",
                "[update.modrinth]",
                f"mod-id = {toml_str(proj['id'])}",
                f"version = {toml_str(v['id'])}",
                "",
            ]),
            encoding="utf-8",
            newline="\n",
        )
        written.add(name)
        ok.append(f"`{proj['slug']}` {proj['title']} — {v['version_number']}")

        # 꼭 필요한 다른 모드(required)는 자동으로 같이 넣는다.
        for dep in v.get("dependencies", []):
            if dep.get("dependency_type") == "required" and dep.get("project_id") and dep["project_id"] not in done_ids:
                wanted.append(dep["project_id"])

    # 직접 만든 모드: custom-mods 폴더의 jar 를 GitHub 주소로 내려받게 등록한다.
    # (Modrinth 에 없는 모드. jar 를 넣거나 빼기만 하면 된다)
    for jar in sorted((ROOT / "custom-mods").glob("*.jar")):
        try:
            with zipfile.ZipFile(jar) as z:
                meta = json.loads(z.read("fabric.mod.json").decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            failed.append(f"`{jar.name}`: Fabric 모드 정보(fabric.mod.json)를 읽지 못했어요 ({e})")
            continue
        mod_id = re.sub(r"[^a-z0-9_-]", "-", str(meta.get("id", jar.stem)).lower())
        mc = (meta.get("depends") or {}).get("minecraft", "")
        name = f"custom-{mod_id}.pw.toml"
        data = jar.read_bytes()
        url = f"https://raw.githubusercontent.com/{REPO}/main/custom-mods/{urllib.parse.quote(jar.name)}"
        side = "client" if meta.get("environment") == "client" else "both"
        (mods_dir / name).write_text(
            "\n".join([
                f"name = {toml_str(meta.get('name') or mod_id)}",
                f"filename = {toml_str(jar.name)}",
                f'side = "{side}"',
                "",
                "[download]",
                f"url = {toml_str(url)}",
                'hash-format = "sha512"',
                f"hash = {toml_str(hashlib.sha512(data).hexdigest())}",
                "",
            ]),
            encoding="utf-8",
            newline="\n",
        )
        written.add(name)
        ok.append(f"`{jar.name}` {meta.get('name') or mod_id} — {meta.get('version', '?')} (직접 만든 모드)")
        deps = meta.get("depends") or {}
        if "fabric-api" in deps and "fabric-api" not in read_mod_list():
            warn.append(f"`{jar.name}`: Fabric API가 필요해요. mods.txt에 fabric-api 를 넣어 주세요")
        if mc and not str(mc).lstrip("~>=^ ").startswith(mc_version.rsplit(".", 1)[0]):
            warn.append(f"`{jar.name}`: 이 모드는 마인크래프트 {mc} 용이에요 (팩은 {mc_version})")

    # mods.txt에서 지운 모드는 목록에서도 지운다.
    for old in mods_dir.glob("*.pw.toml"):
        if old.name not in written:
            old.unlink()

    # index.toml 다시 만들기
    # 플레이어 게임 폴더로 내려보낼 폴더만 넣는다. (런처·공지·도구 파일은 절대 넣지 않음)
    client_dirs = {"mods", "config", "resourcepacks", "shaderpacks"}
    entries = []
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(ROOT).as_posix()
        if "/" not in rel or rel.split("/")[0] not in client_dirs:
            continue
        entries.append((rel, sha256(p), rel.endswith(".pw.toml")))
    lines = ['hash-format = "sha256"', ""]
    for rel, h, meta in entries:
        lines += ["[[files]]", f"file = {toml_str(rel)}", f"hash = {toml_str(h)}"]
        if meta:
            lines.append("metafile = true")
        lines.append("")
    (ROOT / "index.toml").write_text("\n".join(lines), encoding="utf-8", newline="\n")

    # pack.toml 안의 index 지문 갱신
    pack = ROOT / "pack.toml"
    text = pack.read_text(encoding="utf-8")
    text = re.sub(r'(\[index\][^\[]*?hash\s*=\s*")[0-9a-f]+(")', rf"\g<1>{sha256(ROOT / 'index.toml')}\g<2>", text, flags=re.S)
    pack.write_text(text, encoding="utf-8", newline="\n")

    report.append("## ✅ 들어간 모드\n" + ("\n".join(f"- {x}" for x in ok) or "- 없음") + "\n")
    if warn:
        report.append("## ⚠️ 주의\n" + "\n".join(f"- {x}" for x in warn) + "\n")
    if failed:
        report.append("## ❌ 실패\n" + "\n".join(f"- {x}" for x in failed) + "\n")
    (ROOT / "sync_report.md").write_text("\n".join(report), encoding="utf-8", newline="\n")
    print("\n".join(report))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
