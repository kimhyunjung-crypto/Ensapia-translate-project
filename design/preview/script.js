const concepts = {
  focus: {
    name: "A · Focus White",
    description: "업무 집중형 — 원문과 최종본을 빠르게 비교하는 미니멀한 흰색 워크벤치",
  },
  frame: {
    name: "B · Blue Frame",
    description: "브랜드 시스템형 — #2951DA 내비게이션과 명확한 관리 구조를 강조한 사내 도구",
  },
  airy: {
    name: "C · Airy Canvas",
    description: "모던 AI형 — 부드러운 파란 배경과 넉넉한 여백으로 번역 흐름에 집중한 캔버스",
  },
};

const screenNames = {
  translate: "비즈니스 메시지 번역",
  glossary: "ENSAPIA 용어집",
  people: "인명·직책 기준",
  settings: "운영 설정",
};

const appShell = document.querySelector(".app-shell");
const previewStage = document.querySelector(".preview-stage");
const conceptName = document.querySelector("#concept-name");
const conceptDescription = document.querySelector("#concept-description");
const screenTitle = document.querySelector("#screen-title");
const toast = document.querySelector("#toast");
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 1700);
}

document.querySelectorAll("[data-theme-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    const theme = button.dataset.themeChoice;
    appShell.dataset.theme = theme;
    document.querySelectorAll("[data-theme-choice]").forEach((item) => item.classList.toggle("active", item === button));
    conceptName.textContent = concepts[theme].name;
    conceptDescription.textContent = concepts[theme].description;
  });
});

document.querySelectorAll("[data-device-choice]").forEach((button) => {
  button.addEventListener("click", () => {
    previewStage.dataset.device = button.dataset.deviceChoice;
    document.querySelectorAll("[data-device-choice]").forEach((item) => item.classList.toggle("active", item === button));
  });
});

document.querySelectorAll("[data-screen]").forEach((button) => {
  button.addEventListener("click", () => {
    const screen = button.dataset.screen;
    document.querySelectorAll("[data-screen]").forEach((item) => item.classList.toggle("active", item.dataset.screen === screen));
    document.querySelectorAll("[data-screen-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.screenPanel === screen));
    screenTitle.textContent = screenNames[screen];
  });
});

const sourceText = document.querySelector("#source-text");
const charCount = document.querySelector("#char-count");
sourceText.addEventListener("input", () => { charCount.textContent = sourceText.value.length; });

const translateButton = document.querySelector("#translate-button");
const resultText = document.querySelector("#result-text");
const finalTranslation = "佐藤さん、こんにちは。Ontos（IAM）の権限設定について、ご確認をお願いいたします。可能でしたら、本日15時までにご確認いただけますと幸いです。";

translateButton.addEventListener("click", () => {
  translateButton.disabled = true;
  translateButton.querySelector(".action-label").textContent = "번역 중…";
  resultText.style.opacity = ".32";
  window.setTimeout(() => {
    resultText.textContent = finalTranslation;
    resultText.style.opacity = "1";
    translateButton.disabled = false;
    translateButton.querySelector(".action-label").textContent = "번역하기";
    showToast("최종 번역이 완성되었습니다.");
  }, 850);
});

document.querySelector("#copy-button").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(resultText.textContent.trim());
    showToast("최종 번역을 복사했습니다.");
  } catch {
    showToast("브라우저에서 복사 권한을 허용해 주세요.");
  }
});

document.querySelectorAll(".demo-button").forEach((button) => {
  button.addEventListener("click", () => showToast(button.dataset.message || "시안용 버튼입니다."));
});

const glossarySearch = document.querySelector("#glossary-search");
glossarySearch.addEventListener("input", () => {
  const query = glossarySearch.value.trim().toLowerCase();
  document.querySelectorAll("#glossary-rows tr").forEach((row) => {
    row.hidden = query.length > 0 && !row.textContent.toLowerCase().includes(query);
  });
});

document.querySelectorAll("[data-open-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    const dialog = document.querySelector(`#${button.dataset.openDialog}`);
    if (!dialog) return;
    dialog.showModal();
    window.setTimeout(() => dialog.querySelector("input:not([type='checkbox'])")?.focus(), 50);
  });
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", () => button.closest("dialog")?.close());
});

document.querySelectorAll(".entry-dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

function createCell(text, strong = false) {
  const cell = document.createElement("td");
  if (strong) {
    const content = document.createElement("strong");
    content.textContent = text;
    cell.append(content);
  } else {
    cell.textContent = text;
  }
  return cell;
}

document.querySelector("#glossary-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const row = document.createElement("tr");
  row.append(createCell(data.get("sourceTerm"), true));
  row.append(createCell(data.get("targetTerm")));
  row.append(createCell(data.get("description") || "설명 없음"));

  const statusCell = document.createElement("td");
  const status = document.createElement("span");
  status.className = `table-status${data.get("active") ? "" : " muted"}`;
  status.textContent = data.get("active") ? "활성" : "대기";
  statusCell.append(status);
  row.append(statusCell);

  const actionCell = document.createElement("td");
  const more = document.createElement("button");
  more.className = "more-button";
  more.type = "button";
  more.textContent = "•••";
  actionCell.append(more);
  row.append(actionCell);
  document.querySelector("#glossary-rows").prepend(row);

  form.closest("dialog").close();
  form.reset();
  showToast("새 용어가 목록에 추가되었습니다.");
});

const defaultMemberAliases = ["이시와타리 대표님", "이시와타리상", "이시와타리님"];
let memberAliases = [...defaultMemberAliases];
const memberAliasInput = document.querySelector("#member-alias-input");
const memberAliasValue = document.querySelector("#member-alias-value");
const memberAliasChips = document.querySelector("#member-alias-chips");
const memberJapaneseOutput = document.querySelector("#member-japanese-output");
const memberMappingPreview = document.querySelector("#member-mapping-preview");

function renderMemberMapping() {
  memberAliasChips.replaceChildren();
  memberMappingPreview.replaceChildren();
  memberAliasValue.value = memberAliases.join("|");

  memberAliases.forEach((alias) => {
    const chip = document.createElement("span");
    chip.className = "alias-chip";
    chip.append(document.createTextNode(alias));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `${alias} 삭제`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      memberAliases = memberAliases.filter((item) => item !== alias);
      renderMemberMapping();
      memberAliasInput.focus();
    });
    chip.append(remove);
    memberAliasChips.append(chip);

    const row = document.createElement("div");
    const source = document.createElement("span");
    const arrow = document.createElement("span");
    const target = document.createElement("strong");
    source.textContent = alias;
    arrow.className = "mapping-arrow";
    arrow.textContent = "→";
    target.textContent = memberJapaneseOutput.value.trim() || "일본어 표기 입력";
    row.append(source, arrow, target);
    memberMappingPreview.append(row);
  });
}

function addMemberAlias(rawValue) {
  const values = rawValue.split(/[,，\n]/).map((value) => value.trim()).filter(Boolean);
  values.forEach((value) => {
    if (!memberAliases.includes(value)) memberAliases.push(value);
  });
  memberAliasInput.value = "";
  renderMemberMapping();
}

memberAliasInput.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === ",") && memberAliasInput.value.trim()) {
    event.preventDefault();
    addMemberAlias(memberAliasInput.value);
  } else if (event.key === "Backspace" && !memberAliasInput.value && memberAliases.length) {
    memberAliases.pop();
    renderMemberMapping();
  }
});
memberAliasInput.addEventListener("blur", () => {
  if (memberAliasInput.value.trim()) addMemberAlias(memberAliasInput.value);
});
memberJapaneseOutput.addEventListener("input", renderMemberMapping);
renderMemberMapping();

document.querySelector("#member-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (memberAliasInput.value.trim()) addMemberAlias(memberAliasInput.value);
  if (!memberAliases.length) {
    showToast("한국어 인식 표현을 하나 이상 추가해 주세요.");
    memberAliasInput.focus();
    return;
  }
  const data = new FormData(form);
  const output = String(data.get("japaneseOutput"));
  const card = document.createElement("article");
  card.className = "person-card";

  const avatar = document.createElement("div");
  avatar.className = "person-avatar";
  avatar.textContent = output.replace(/さん$/, "").slice(0, 1);

  const identity = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = output;
  const role = document.createElement("span");
  role.textContent = `한국어 인식 표현 ${memberAliases.length}개`;
  identity.append(name, role);

  const details = document.createElement("dl");
  [["인식 표현", memberAliases.join(" · ")], ["통합 표기", output]].forEach(([label, value]) => {
    const item = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    item.append(term, description);
    details.append(item);
  });

  const status = document.createElement("span");
  status.className = "sample-tag";
  status.textContent = data.get("active") ? "활성" : "대기";
  card.append(avatar, identity, details, status);
  document.querySelector(".people-grid .add-card").before(card);

  form.closest("dialog").close();
  form.reset();
  memberAliases = [...defaultMemberAliases];
  renderMemberMapping();
  showToast("새 멤버가 목록에 추가되었습니다.");
});
