# ❄ 엘사서버 런처

엘사서버(182.231.191.87) 전용 접속 런처와 자동 업데이트 모드 목록이에요.

## 시청자 설치 방법

1. [prismlauncher.org](https://prismlauncher.org) 에서 Prism 런처를 받아 설치해요.
2. 오른쪽 위 **계정** → **계정 관리** → **Microsoft 추가**로 정품 계정에 로그인해요.
3. 왼쪽 위 **인스턴스 추가** → 왼쪽 목록 **가져오기**를 눌러요.
4. 아래 주소를 붙여넣고 **확인**을 눌러요.

   ```
   https://raw.githubusercontent.com/summim/elsa-test-launcher/main/launcher/elsa-launcher.zip
   ```

5. 생긴 눈송이 아이콘을 두 번 클릭하면 모드가 자동으로 업데이트되고 엘사서버로 바로 들어가요.

정품 마인크래프트(Java 에디션) 계정이 있어야 해요.

## 모드 추가·삭제하는 법 (운영자용)

1. 이 저장소에서 `mods.txt`를 열고 오른쪽 위 연필 아이콘(✏️)을 눌러요.
2. 모드를 넣으려면 Modrinth 주소의 마지막 이름을 한 줄에 하나씩 적어요. (예: `modrinth.com/mod/iris` → `iris`)
   빼려면 그 줄을 지워요.
3. 오른쪽 위 **Commit changes** → 다시 **Commit changes**를 눌러요.
4. 1~2분 기다린 뒤 `sync_report.md`를 열어 결과를 확인해요. ✅면 성공, ❌면 그 모드는 1.21.4 Fabric 버전이 없는 거예요.

다음에 시청자가 런처를 누르면 바뀐 모드가 자동으로 받아져요.
Paper 서버라서 **플레이어 쪽에서만 돌아가는 모드**만 쓸 수 있어요. 결과에 ⚠️가 뜨면 그 모드는 빼는 게 좋아요.

## 파일 설명

| 파일 | 하는 일 |
|---|---|
| `mods.txt` | 모드 목록 (여기만 고치면 돼요) |
| `pack.toml` | 모드팩 기본 정보 (마인크래프트 1.21.4, Fabric) |
| `index.toml`, `mods/` | 자동으로 만들어지는 파일 목록. 직접 고치지 마세요 |
| `sync_report.md` | 마지막 모드 목록 업데이트 결과 |
| `config/elsa-version.txt` | 자동 업데이트 확인용 파일 |
| `launcher/elsa-launcher.zip` | 시청자가 가져오는 런처 파일 |
| `tools/`, `.github/` | 자동 업데이트 도구 |

런처는 실행할 때마다 `pack.toml`을 확인해서, 바뀐 내용이 있으면 자동으로 받아요.
`pack.toml`, `index.toml`, `mods/` 안의 `hash`(파일 지문) 값이 실제 파일과 다르면 업데이트가 실패하니 직접 고치지 마세요.
