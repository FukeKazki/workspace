// deno-fmt-ignore-file
// deno-lint-ignore-file
// This code was bundled using `deno bundle` and it's not recommended to edit it manually

const API_BASE = "http://localhost:9281/";
let recentWindowName = "";
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
    if (hasActiveTabInGroup) {} else {
        if (tabsInGroup[0]?.id) {
            await chrome.tabs.update(tabsInGroup[0].id, {
                active: true
            });
        }
    }
}
function createNewTabGroup(groupName) {
    fetch(`${API_BASE}fallback`).then(async (res)=>{
        const json = await res.json();
        const tabs = json[groupName]?.tabs ?? json.default?.tabs ?? [];
        const groups = await chrome.tabGroups.query({});
        for await (const group of groups){
            await chrome.tabGroups.update(group.id, {
                collapsed: true
            });
        }
        const tabIds = [
            -1
        ];
        for await (const tab of tabs){
            const option = tab ? {
                url: tab
            } : {};
            const { id  } = await chrome.tabs.create(option);
            if (id) {
                tabIds.push(id);
            }
        }
        const groupId = await chrome.tabs.group({
            tabIds
        });
        await chrome.tabGroups.update(groupId, {
            title: groupName
        });
    }).catch((e)=>{
        createNotification("通信エラー", e.toString());
    });
}
let activeTabGroupId = 0;
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
function createNotification(title, message) {
    chrome.notifications.create({
        type: "basic",
        iconUrl: "/icon.png",
        title: title,
        message: message,
        priority: 1
    });
}
check();
findActiveTabGrup();
chrome.windows.onFocusChanged.addListener(()=>{
    check();
    findActiveTabGrup();
});
chrome.tabs.onCreated.addListener((tab)=>{
    if (!tab.id) return;
    chrome.tabs.group({
        groupId: activeTabGroupId,
        tabIds: [
            tab.id
        ]
    });
});
chrome.tabs.onRemoved.addListener(()=>findActiveTabGrup());
chrome.tabs.onCreated.addListener(async (tab)=>{
    if (!tab.id) return;
    const groupId = activeTabGroupId || (await chrome.tabGroups.query({
        collapsed: false
    }))[0]?.id;
    chrome.tabs.group({
        groupId,
        tabIds: [
            tab.id
        ]
    });
});
