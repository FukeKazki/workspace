// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

const API_BASE = "http://localhost:9281/";
let recentWindowName = "";
let internalTabCreatingModeStartUnixTimeMs = 0;
function check() {
    fetch(`${API_BASE}active`).then(async (res)=>{
        const json = await res.json();
        const windowName = json.window_name;
        if (!windowName) {
            createNotification("エラー", "アクティブなtmuxセッションまたはウィンドウが見つかりません");
            return;
        }
        if (windowName === recentWindowName) {
            return;
        }
        recentWindowName = windowName;
        await changeTabGroup(windowName);
    }).catch((e)=>{
        createNotification("通信エラー", e.toString());
    });
}
async function changeTabGroup(groupName) {
    const groups = await chrome.tabGroups.query({});
    const group = groups.find((group)=>group.title === groupName);
    if (!group) {
        createNewTabGroup(groupName);
        return;
    }
    for await (const group1 of groups){
        await chrome.tabGroups.update(group1.id, {
            collapsed: true
        });
    }
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
function createNewTabGroup(groupName) {
    fetch(`${API_BASE}fallback`).then(async (res)=>{
        const json = await res.json();
        const tabs = json[groupName]?.tabs ?? json.default?.tabs ?? [];
        const tabIds = [];
        const groups = await chrome.tabGroups.query({});
        for await (const group of groups){
            await chrome.tabGroups.update(group.id, {
                collapsed: true
            });
        }
        for await (const tab of tabs){
            const option = tab ? {
                url: tab
            } : {};
            internalTabCreatingModeStartUnixTimeMs = Date.now();
            const id = (await chrome.tabs.create(option)).id;
            if (!id) continue;
            tabIds.push(id);
        }
        const groupId = await chrome.tabs.group({
            tabIds
        });
        if (!groupId) return;
        await chrome.tabGroups.update(groupId, {
            title: groupName
        });
    }).catch((e)=>{
        createNotification("通信エラー", e.toString());
    });
}
function createNotification(title, message) {
    chrome.notifications.create({
        type: "basic",
        iconUrl: "/icon.png",
        title: title,
        message: message,
        priority: 1
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
