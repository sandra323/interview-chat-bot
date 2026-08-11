# AI Chat Page — Acceptance Checklist

```yaml
feature: ai-chat-page
doc_role: current-state
last_verified: 2026-08-11
```

Manual smoke against **shipped** behavior in [`../engineering/current-state.md`](../engineering/current-state.md).

## Core chat

- [ ] Send message → streaming assistant reply  
- [ ] Stop mid-generation  
- [ ] Enter sends; IME composition does not false-send  
- [ ] Errors show antd toast  
- [ ] Refresh keeps model + active conversation context as designed (persist + server history)

## History sidebar

- [ ] List loads; empty state copy when none  
- [ ] Switch conversation; background gen shows “生成中”  
- [ ] Hover (desktop) / always (touch) shows ⋮ menu  
- [ ] Rename updates sidebar + header when active  
- [ ] Empty rename title stays open / warns  
- [ ] Delete non-active removes row only  
- [ ] Delete active clears main pane; input not stuck on Stop  
- [ ] Delete while generating does not leave ghost generating forever  

## UI shell

- [ ] Dark tokens / sidebar collapse  
- [ ] Empty state suggestions  
- [ ] Header title ellipsis when narrow; full title when space allows  
- [ ] Assistant bubble **复制** + code-block copy  
- [ ] Mock badge when `USE_MOCK`  

## Explicitly out of this checklist (**planned**)

- Login / multi-user  
- Theme toggle  
- File upload / export  
