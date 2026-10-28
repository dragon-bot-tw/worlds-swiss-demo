# Spec Delta

## Purpose

把 2026 世界賽瑞士輪的官方賽程凍結成一份可重複讀取的賽果，讓已結束場次不必手打，頁面執行時也不再連線更新。

## ADDED Requirements

### Requirement: Snapshot keeps the 2026 Swiss stage
快照 SHALL 只保留 `blockName` 為「瑞士制循環賽」且 `startTime` 落在 2026 年的場次。兩邊隊伍代碼都不是實際參賽代碼的場次 SHALL 被排除，包括 TBD 對 TBD。

#### Scenario: Older Swiss events are excluded
- **WHEN** 賽程回應同時含有 2025 與 2026 的瑞士制循環賽
- **THEN** 快照只保留 2026 的場次

#### Scenario: Undrawn placeholder matches are excluded
- **WHEN** 一場瑞士輪的兩邊隊伍代碼都是 TBD
- **THEN** 快照不包含該場

#### Scenario: Drawn 2026 matches are kept
- **WHEN** 一場 2026 瑞士輪的兩邊都是實際隊伍代碼
- **THEN** 快照包含該場，不論它已完成或尚未開始

### Requirement: Winner comes from series outcome
每場 SHALL 記錄兩邊隊伍代碼，以及 `outcome` 為 win 的隊伍代碼作為勝者。兩邊 `outcome` 皆為空時，勝者 SHALL 為空。快照 MUST NOT 保存賽程回應中的 `record` 欄位。

#### Scenario: Completed series
- **WHEN** 一場已完成系列賽的其中一隊 `outcome` 為 win
- **THEN** 快照的勝者是該隊代碼

#### Scenario: Unstarted series
- **WHEN** 一場尚未開始的系列賽兩邊 `outcome` 都是空值
- **THEN** 快照的勝者為空

#### Scenario: Running record is discarded
- **WHEN** 賽程回應在每一場上都附有隊伍目前的總戰績
- **THEN** 快照不保存該總戰績

### Requirement: Snapshot stays static at runtime
執行中的頁面 SHALL 讀取這份已寫入的快照，且 MUST NOT 呼叫官方賽程 API。快照檔 MUST NOT 包含 API key。

#### Scenario: Page reads the saved snapshot
- **WHEN** 使用者開啟試算頁
- **THEN** 官方賽果來自已寫入的 JSON，而不是一次新的賽程請求

#### Scenario: API key is not stored
- **WHEN** 檢查快照檔與頁面所提供的檔案
- **THEN** 其中沒有官方賽程 API key
