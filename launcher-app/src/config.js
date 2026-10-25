// 숨밈 테스트 서버 런처 설정. 서버 주소나 GitHub 저장소가 바뀌면 여기만 고치면 돼요.
module.exports = {
  serverName: '숨밈 테스트 서버',
  serverHost: '182.231.191.87',
  serverPort: 25565,
  minecraftVersion: '1.21.4',

  // Prism 안의 인스턴스 폴더 이름 (prism/instances/<id>)
  instanceId: 'elsa',

  // 공지, 모드 목록, 런처 새 버전 정보를 가져오는 GitHub 주소
  repoRaw: 'https://raw.githubusercontent.com/summim/elsa-test-launcher/main',
  repoPage: 'https://github.com/summim/elsa-test-launcher',
};
