# ❄ 엘사서버 런처

숨밈 테스트 서버 전용 접속 런처와 자동 업데이트 모드 목록이에요.

## 숨밈 테스트 서버 런처 받기 (추천)

1. [최신 런처 다운로드](https://github.com/summim/elsa-test-launcher/releases/latest) 페이지에서 `SumimLauncher-…-win64.zip`을 받아요.
2. 압축을 풀고 `SumimLauncher.exe`를 실행해요. ("PC 보호" 창이 뜨면 **추가 정보** → **실행**)
3. 왼쪽 아래 **Microsoft 로그인** → Prism 창에서 로그인 → 창 닫기
4. **게임 시작**을 누르면 모드가 자동으로 맞춰지고 서버로 바로 들어가요.

윈도우 전용이에요. 맥 사용자는 아래 Prism 방법을 쓰세요.

## 시청자 설치 방법 (Prism 런처를 직접 쓰는 경우)

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
   Modrinth **리소스팩**도 같은 방법으로 넣을 수 있어요. 리소스팩은 `config/resourcepackoverrides.json`에 `"file/이름.zip": {"required": true}`를 추가해야 자동으로 켜져요.
   빼려면 그 줄을 지워요.
3. 오른쪽 위 **Commit changes** → 다시 **Commit changes**를 눌러요.
4. 1~2분 기다린 뒤 `sync_report.md`를 열어 결과를 확인해요. ✅면 성공, ❌면 그 모드는 1.21.4 Fabric 버전이 없는 거예요.

다음에 시청자가 런처를 누르면 바뀐 모드가 자동으로 받아져요.
Paper 서버라서 **플레이어 쪽에서만 돌아가는 모드**만 쓸 수 있어요. 결과에 ⚠️가 뜨면 그 모드는 빼는 게 좋아요.

### 직접 만든 모드 넣기 (Modrinth에 없는 모드)

1. `custom-mods` 폴더를 열고 **Add file** → **Upload files**로 Fabric 모드 jar 파일을 올려요.
2. **Commit changes**를 누르면 1~2분 뒤 자동으로 모드 목록에 들어가요. (`sync_report.md`에 "직접 만든 모드"로 표시)
3. 버전을 바꿀 때는 예전 jar를 지우고 새 jar를 올려요. 빼려면 jar만 지우면 돼요.

## 런처 공지 쓰는 법 (운영자용)

### 자동 공지
모드(`mods.txt`, `custom-mods/`), 리소스팩, 쉐이더팩, 설정 파일을 바꾸거나 `launcher-data/launcher.json`의 런처 버전을 올리면,
GitHub가 1~2분 안에 런처 공지를 자동으로 써요. 같은 날 여러 번 바꾸면 그날 공지 하나에 합쳐져요.

### 직접 쓰는 공지

1. `launcher-data/notices.json`을 열고 연필 아이콘(✏️)을 눌러요.
2. 맨 위 `[` 바로 아래에 새 공지를 하나 추가해요. 공지끼리는 쉼표(,)로 구분해요.

   ```json
   {
     "date": "2026-11-01",
     "title": "공지 제목",
     "tag": "점검",
     "body": "공지 내용. 줄을 바꾸려면 \\n 을 써요."
   },
   ```

3. **Commit changes**를 누르면, 런처를 켜 둔 사람에게도 10분 안에 보여요.

쉼표나 따옴표가 하나라도 빠지면 공지 전체가 안 보여요. 저장 후 런처에서 공지가 보이는지 꼭 확인하세요.

## 파일 설명

| 파일 | 하는 일 |
|---|---|
| `mods.txt` | 모드 목록 (여기만 고치면 돼요) |
| `custom-mods/` | 직접 만든 모드 jar (예: 홀덤) |
| `pack.toml` | 모드팩 기본 정보 (마인크래프트 1.21.4, Fabric) |
| `index.toml`, `mods/` | 자동으로 만들어지는 파일 목록. 직접 고치지 마세요 |
| `sync_report.md` | 마지막 모드 목록 업데이트 결과 |
| `config/elsa-version.txt` | 자동 업데이트 확인용 파일 |
| `launcher/elsa-launcher.zip` | 시청자가 가져오는 런처 파일 |
| `launcher-data/notices.json` | 런처 공지 |
| `launcher-data/launcher.json` | 최신 런처 버전 (새 버전 알림용) |
| `tools/`, `.github/` | 자동 업데이트 도구 |

런처는 실행할 때마다 `pack.toml`을 확인해서, 바뀐 내용이 있으면 자동으로 받아요.
`pack.toml`, `index.toml`, `mods/` 안의 `hash`(파일 지문) 값이 실제 파일과 다르면 업데이트가 실패하니 직접 고치지 마세요.
