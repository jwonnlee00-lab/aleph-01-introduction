import Image from "next/image";

const stories = [
  {
    number: "01",
    title: "단기간의 몰입",
    text: "산업안전기사를 준비하며 유튜브 강의를 전체적으로 듣고, 기출문제의 답안을 직접 말할 수 있을 때까지 반복했습니다. 목표가 정해지면 짧은 기간 깊게 몰입하는 편입니다.",
    image: "/evidence/safety-certificate.png",
    alt: "산업안전기사 실기 합격 결과 화면",
    imageClass: "object-contain bg-white",
    imageFrameClass: "",
  },
  {
    number: "02",
    title: "퍼즐 게임",
    text: "스도쿠와 ROK 게임처럼 가볍게 집중해 풀 수 있는 퍼즐을 좋아합니다. Rusty Lake 시리즈는 약 10년째 즐기고 있습니다.",
    image: "/evidence/rusty-lake.png",
    alt: "설치된 Rusty Lake 게임 세 작품의 목록",
    imageClass: "object-contain",
    imageFrameClass: "",
  },
  {
    number: "03",
    title: "마음에 들면 처음부터 끝까지",
    text: "음악이나 영상, 드라마를 발견하면 처음부터 끝까지 정주행합니다. 요즘은 SAILORR의 ‘FROM FLORIDA’S FINEST’ Deluxe를 자주 듣습니다.",
    image: "/evidence/album.png",
    alt: "처음부터 끝까지 감상한 R&B 앨범 화면",
    imageClass: "object-contain",
    imageFrameClass: "story-image--album",
  },
];

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main-content">본문으로 바로가기</a>
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="처음으로 이동">
          JW<span>.</span>
        </a>
        <nav aria-label="페이지 내 이동">
          <a href="#about">소개</a>
          <a href="#stories">취향과 강점</a>
          <a href="#private-space">나만의 자리 · 잠김</a>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1}>

      <section className="intro" id="top">
        <div className="intro-copy" id="about">
          <p className="eyebrow">ABOUT ME</p>
          <h1>짧게 몰입하고,<br />오래 좋아하고,<br />끝까지 봅니다.</h1>
          <p className="lede">
            IT 및 보안 인프라 분야를 배우고 있는 비전공자입니다.
            저를 설명하는 장점과 오래 즐겨온 취미를 소개합니다.
          </p>
        </div>
        <aside className="intro-note" aria-label="나를 설명하는 세 단어">
          <span>IN THREE WORDS</span>
          <p>몰입 · 퍼즐 · 정주행</p>
        </aside>
      </section>

      <section className="stories" id="stories" aria-labelledby="stories-title">
        <div className="section-heading">
          <p className="eyebrow">THREE THINGS ABOUT ME</p>
          <h2 id="stories-title">나를 설명하는 세 가지</h2>
        </div>
        <div className="story-grid">
          {stories.map((story) => (
            <article className="story-card" key={story.number}>
              <div className={`story-image ${story.imageFrameClass ?? ""}`}>
                <Image src={story.image} alt={story.alt} fill sizes="(max-width: 760px) 100vw, 33vw" className={story.imageClass} />
              </div>
              <div className="story-body">
                <span className="story-number">{story.number}</span>
                <h3>{story.title}</h3>
                <details className="story-details" open>
                  <summary>
                    <span className="detail-label detail-label--closed">설명 보기</span>
                    <span className="detail-label detail-label--open">설명 접기</span>
                    <span className="detail-mark" aria-hidden="true" />
                  </summary>
                  <p>{story.text}</p>
                </details>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="private-boundary" id="private-space" aria-labelledby="private-title">
        <div>
          <p className="eyebrow">PRIVATE · 비공개 영역</p>
          <h2 id="private-title">나만의 자리</h2>
          <p>위의 소개와 취향은 누구나 볼 수 있습니다. 이 아래는 패스키로 들어갈 개인 공간입니다.</p>
          <p className="private-status">잠김 · 비공개 자료 3개</p>
          <p>패스키 등록은 ‘잠금 상태 확인하기’에서 진행합니다. 로그인은 다음 카드에서 연결합니다.</p>
          <a className="private-link" href="/private">잠금 상태 확인하기 <span aria-hidden="true">→</span></a>
        </div>
        <aside aria-label="비공개 자료 안내">내용은 로그인 전에 내려받지 않습니다.<br />연습용 가상 자료만 사용합니다.</aside>
      </section>
      </main>
    </>
  );
}
