type EmptyWorkspaceProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: string;
  upcoming: readonly string[];
};

export function EmptyWorkspace({
  eyebrow,
  title,
  description,
  icon,
  upcoming,
}: EmptyWorkspaceProps) {
  return (
    <section aria-labelledby={`${eyebrow.toLowerCase()}-heading`}>
      <div className="page-intro">
        <div>
          <p className="section-kicker">{eyebrow}</p>
          <h2 id={`${eyebrow.toLowerCase()}-heading`}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <div className="empty-workspace">
        <span className="empty-workspace-icon" aria-hidden="true">{icon}</span>
        <div>
          <strong>작업 영역이 준비되었습니다</strong>
          <p>이 화면의 데이터 기능은 다음 EPIC에서 순서대로 연결됩니다.</p>
        </div>
        <ul aria-label="연결 예정 기능">
          {upcoming.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
    </section>
  );
}
