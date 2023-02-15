import { API_BASE, createNotification } from "./util.ts";

let recentWindowName = "";

// 拡張機能がタブを作成している間はonCreatedでしてる処理が実行されないようにする
let internalTabCreatingModeStartUnixTimeMs = 0;

function check() {
  fetch(`${API_BASE}active`).then(async (res) => {
    const json = await res.json();
    const windowName = json.window_name;
    if (!windowName) {
      createNotification(
        "エラー",
        "アクティブなtmuxセッションまたはウィンドウが見つかりません",
      );
      return;
    }
    if (windowName === recentWindowName) {
      return;
    }
    recentWindowName = windowName;
    await changeTabGroup(windowName);
  }).catch((e) => {
    createNotification("通信エラー", e.toString());
  });
}

async function changeTabGroup(groupName: string) {
  const groups = await chrome.tabGroups.query({});
  const group = groups.find((group) => group.title === groupName);
  if (!group) {
    createNewTabGroup(groupName);
    // createNotification('タブグループ', `${groupName}を作成しました`)
    return;
  }
  for await (const group of groups) {
    await chrome.tabGroups.update(group.id, { collapsed: true });
  }
  await chrome.tabGroups.update(group.id, { collapsed: false });
  const tabsInGroup = await chrome.tabs.query({ groupId: group.id });
  const hasActiveTabInGroup = tabsInGroup.some((tab) => tab.active === true);
  if (!hasActiveTabInGroup) {
    const id = tabsInGroup[0]?.id;
    if (!id) return;
    await chrome.tabs.update(id, { active: true });
  }
}

/**
 * 新しいタブグループを作成する
 */
function createNewTabGroup(groupName: string) {
  fetch(`${API_BASE}fallback`).then(async (res) => {
    const json = await res.json();
    const tabs = json[groupName]?.tabs ?? json.default?.tabs ?? [];
    const tabIds = [];
    const groups = await chrome.tabGroups.query({});
    for await (const group of groups) {
      await chrome.tabGroups.update(group.id, { collapsed: true });
    }
    for await (const tab of tabs) {
      const option = tab ? { url: tab } : {};
      internalTabCreatingModeStartUnixTimeMs = Date.now();
      const id = (await chrome.tabs.create(option)).id;
      if (!id) continue;
      tabIds.push(id);
    }
    // @ts-ignore タプルが変なのなんとかする
    const groupId = await chrome.tabs.group({ tabIds });
    if (!groupId) return;
    await chrome.tabGroups.update(groupId, { title: groupName });
  }).catch((e) => {
    createNotification("通信エラー", e.toString());
  });
}

// アクティブなタブグループのIDを保持しておく
let activeTabGroupId: number;
async function findActiveTabGrup() {
  const groups = await chrome.tabGroups.query({});
  for await (const group of groups) {
    const tabsInGroup = await chrome.tabs.query({ groupId: group.id });
    const hasActiveTabInGroup = tabsInGroup.some((tab) => tab.active === true);
    if (hasActiveTabInGroup) {
      activeTabGroupId = group.id;
    }
  }
}

check();
findActiveTabGrup();

chrome.windows.onFocusChanged.addListener(
  () => {
    check();
    findActiveTabGrup();
  },
);

chrome.tabs.onActivated.addListener(
  () => findActiveTabGrup(),
);

chrome.tabs.onRemoved.addListener(
  () => findActiveTabGrup(),
);

// 新規タブを作った時に、今アクティブなタブグループの中に入れ込む
chrome.tabs.onCreated.addListener(
  async (tab) => {
    if (Date.now() - internalTabCreatingModeStartUnixTimeMs > 500) {
      const groupId = activeTabGroupId ||
        (await chrome.tabGroups.query({ collapsed: false }))[0].id;
      if (!tab.id) return;
      chrome.tabs.group({ groupId, tabIds: [tab.id] });
    }
  },
);
