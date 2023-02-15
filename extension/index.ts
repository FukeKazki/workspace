const API_BASE = "http://localhost:9281/";
let recentWindowName = "";

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
  const groups = await chromeTabGroupsQuery({});
  const group = groups.find((group) => group.title === groupName);
  if (!group) {
    createNewTabGroup(groupName);
    // createNotification('タブグループ', `${groupName}を作成しました`)
    return;
  }
  for await (const group of groups) {
    await chromeTabGroupsUpdate(group.id, { collapsed: true });
  }
  await chromeTabGroupsUpdate(group.id, { collapsed: false });
  const tabsInGroup = await chromeTabsQuery({ groupId: group.id });
  const hasActiveTabInGroup = tabsInGroup.some((tab) => tab.active === true);
  if (hasActiveTabInGroup) {
    // createNotification('タブグループの移動をキャンセルしました', `${groupName}内のタブをすでに開いています`)
  } else {
    // createNotification('タブグループを移動しました', `${groupName}に移動しました`)
    if (tabsInGroup[0]?.id) {
      await chromeTabsUpdate(tabsInGroup[0].id, { active: true });
    }
  }
}

/**
 * 新しいタブグループを作成する
 */
function createNewTabGroup(groupName: string) {
  fetch(`${API_BASE}fallback`).then(async (res) => {
    const json = await res.json();
    const tabs = json[groupName]?.tabs ?? json.default?.tabs ?? [];
    const groups = await chromeTabGroupsQuery({});
    for await (const group of groups) {
      await chromeTabGroupsUpdate(group.id, { collapsed: true });
    }
    const tabIds: [number] = [-1];
    for await (const tab of tabs) {
      const option = tab ? { url: tab } : {};
      const { id } = await chromeTabsCreate(option);
      if (id) {
        tabIds.push(id);
      }
    }
    const groupId = await chromeTabsGroup({
      tabIds,
    });
    await chromeTabGroupsUpdate(groupId, { title: groupName });
  }).catch((e) => {
    createNotification("通信エラー", e.toString());
  });
}

/** ---------------------------------------------- */
/** ChromeのAPIがコールバック地獄だからpromiseにする */
/** ---------------------------------------------- */

/**
 * タブを作る
 * https://developer.chrome.com/docs/extensions/reference/tabs/#method-create
 */
function chromeTabsCreate(option: Parameters<typeof chrome.tabs.create>[0]) {
  return chrome.tabs.create(
    option,
  );
}

/**
 * タブを探す
 * https://developer.chrome.com/docs/extensions/reference/tabs/#method-query
 */
function chromeTabsQuery(option: Parameters<typeof chrome.tabs.query>[0]) {
  return chrome.tabs.query(option);
}

/**
 * タブを操作する
 * https://developer.chrome.com/docs/extensions/reference/tabs/#method-update
 */
function chromeTabsUpdate(
  tabId: number,
  option: Parameters<typeof chrome.tabs.update>[0],
) {
  return chrome.tabs.update(tabId, option);
}

/**
 * タブをグループにする
 * https://developer.chrome.com/docs/extensions/reference/tabs/#method-group
 */
function chromeTabsGroup(option: Parameters<typeof chrome.tabs.group>[0]) {
  return chrome.tabs.group(
    option,
  );
}

/**
 * タブグループを更新する
 * https://developer.chrome.com/docs/extensions/reference/tabGroups/#method-update
 */
function chromeTabGroupsUpdate(
  groupId: number,
  option: Parameters<typeof chrome.tabGroups.update>[1],
) {
  return chrome.tabGroups.update(
    groupId,
    option,
  );
}

/**
 * タブグループを探す
 * https://developer.chrome.com/docs/extensions/reference/tabGroups/#method-query
 */
function chromeTabGroupsQuery(
  option: Parameters<typeof chrome.tabGroups.query>[0],
) {
  return chrome.tabGroups.query(option);
}
// アクティブなタブグループのIDを保持しておく
let activeTabGroupId = 0;
async function findActiveTabGrup() {
  const groups = await chromeTabGroupsQuery({});
  for await (const group of groups) {
    const tabsInGroup = await chromeTabsQuery({ groupId: group.id });
    const hasActiveTabInGroup = tabsInGroup.some((tab) => tab.active === true);
    if (hasActiveTabInGroup) {
      activeTabGroupId = group.id;
    }
  }
}

/**
 * 通知を表示する
 */
function createNotification(title: string, message: string) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "/icon.png",
    title: title,
    message: message,
    priority: 1,
  });
}

check();
findActiveTabGrup();
chrome.windows.onFocusChanged.addListener(
  () => {
    check();
    findActiveTabGrup();
  },
);
// 新規タブを作った時に、今アクティブなタブグループの中に入れ込む
chrome.tabs.onCreated.addListener(
  (tab) => {
    if (!tab.id) return;
    chromeTabsGroup({ groupId: activeTabGroupId, tabIds: [tab.id] });
  },
);

chrome.tabs.onRemoved.addListener(
  () => findActiveTabGrup(),
);

// 新規タブを作った時に、今アクティブなタブグループの中に入れ込む
chrome.tabs.onCreated.addListener(
  async (tab) => {
    if (!tab.id) return;
    const groupId = activeTabGroupId ||
      (await chromeTabGroupsQuery({ collapsed: false }))[0]?.id;
    chromeTabsGroup({ groupId, tabIds: [tab.id] });
  },
);
