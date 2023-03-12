// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

const API_BASE = "http://localhost:9281/";
const createNotification = (title, message)=>{
    chrome.notifications.create({
        type: "basic",
        iconUrl: "/icon.png",
        title: title,
        message: message,
        priority: 1
    });
};
const switchTmuxWindow = async (windowName)=>{
    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    await fetch(`${API_BASE}switch`, {
        method: "POST",
        body: JSON.stringify({
            "window_name": windowName
        }),
        headers
    });
};
const fetchActiveWindow = async ()=>{
    const res = await fetch(`${API_BASE}active`);
    const { window_name  } = await res.json();
    return window_name;
};
const fetchFallbackWindow = async ()=>{
    const res = await fetch(`${API_BASE}fallback`);
    return await res.json();
};
let recentWindowName = "";
let internalTabCreatingModeStartUnixTimeMs = 0;
async function check() {
    const windowName = await fetchActiveWindow().catch((e)=>{
        createNotification("通信エラー", e.toString());
    });
    if (!windowName) {
        return createNotification("エラー", "アクティブなtmuxセッションまたはウィンドウが見つかりません");
    }
    if (windowName === recentWindowName) {
        return;
    }
    recentWindowName = windowName;
    await changeTabGroup(windowName);
}
async function changeTabGroup(groupName) {
    const groups = await chrome.tabGroups.query({});
    const group = groups.find((group)=>group.title === groupName);
    if (!group) {
        createNewTabGroup(groupName);
        return;
    }
    await Promise.all(groups.map((g)=>chrome.tabGroups.update(g.id, {
            collapsed: true
        })));
    await chrome.tabGroups.update(group.id, {
        collapsed: false
    });
    const tabsInGroup = await chrome.tabs.query({
        groupId: group.id
    });
    const hasActiveTabInGroup = tabsInGroup.some((tab)=>tab.active === true);
    if (!hasActiveTabInGroup) {
        const id = tabsInGroup[0]?.id;
        if (!id) return;
        await chrome.tabs.update(id, {
            active: true
        });
    }
}
async function createNewTabGroup(groupName) {
    const json = await fetchFallbackWindow();
    const tabs = json[groupName]?.tabs ?? json.default?.tabs ?? [];
    const groups = await chrome.tabGroups.query({});
    await Promise.all(groups.map((g)=>chrome.tabGroups.update(g.id, {
            collapsed: true
        })));
    internalTabCreatingModeStartUnixTimeMs = Date.now();
    const tabIds = (await Promise.all(tabs.map((tab)=>{
        const option = tab ? {
            url: tab
        } : {};
        return chrome.tabs.create(option);
    }))).map((v)=>v.id);
    const groupId = await chrome.tabs.group({
        tabIds
    });
    if (!groupId) return;
    await chrome.tabGroups.update(groupId, {
        title: groupName
    });
}
let activeTabGroupId;
async function findActiveTabGrup() {
    const groups = await chrome.tabGroups.query({});
    for await (const group of groups){
        const tabsInGroup = await chrome.tabs.query({
            groupId: group.id
        });
        const hasActiveTabInGroup = tabsInGroup.some((tab)=>tab.active === true);
        if (hasActiveTabInGroup) {
            activeTabGroupId = group.id;
            if (!group.title) return;
            await switchTmuxWindow(group.title);
        }
    }
}
check();
findActiveTabGrup();
chrome.windows.onFocusChanged.addListener(()=>{
    check();
    findActiveTabGrup();
});
chrome.tabs.onActivated.addListener(()=>findActiveTabGrup());
chrome.tabs.onRemoved.addListener(()=>findActiveTabGrup());
chrome.tabs.onCreated.addListener(async (tab)=>{
    if (Date.now() - internalTabCreatingModeStartUnixTimeMs > 500) {
        const groupId = activeTabGroupId || (await chrome.tabGroups.query({
            collapsed: false
        }))[0].id;
        if (!tab.id) return;
        chrome.tabs.group({
            groupId,
            tabIds: [
                tab.id
            ]
        });
    }
});
