# Spec Delta

## Purpose

讓使用者在凍結的官方賽果上試算尚未開打的系列賽，並在同一張轉播式對戰圖上看見誰晉級、誰淘汰。

## ADDED Requirements

### Requirement: One broadcast bracket
系統 SHALL 以單張由左至右的轉播式對戰圖呈現瑞士輪。每一列 SHALL 顯示賽區種子、隊伍代碼與 VS，晉級與淘汰 SHALL 出現在該條對戰線的末端空位。

#### Scenario: Bracket is one graphic
- **WHEN** 使用者開啟試算頁
- **THEN** 各輪、晉級空位與淘汰空位屬於同一張對戰圖，而不是各自獨立的統計卡

### Requirement: Official winners stay locked
快照中已有勝者的場次 SHALL 顯示該勝者。使用者 MUST NOT 改寫該勝者。

#### Scenario: Completed match ignores trial input
- **WHEN** 使用者對一場快照已有勝者的比賽嘗試指定另一個勝者
- **THEN** 該場勝者維持快照中的隊伍

### Requirement: Team click opens the panel
在對戰圖上點一支隊伍 SHALL 只開啟該隊的局面板，且 MUST NOT 因此改寫任何場次勝者。面板 SHALL 顯示含試算在內的戰績、距離晉級還要贏的場數、距離淘汰還要輸的場數，以及這一隊剩餘系列賽的每一條走向與機率。同一時間 SHALL 只開啟一個面板。

#### Scenario: Opening a team does not pick a winner
- **WHEN** 使用者點擊對戰圖上的 T1
- **THEN** 畫面開啟 T1 的局面板，且該點擊沒有改變任何場次的勝者

#### Scenario: Panel shows the remaining record
- **WHEN** T1 的官方戰績為 2 勝 1 敗且沒有試算
- **THEN** 面板顯示再贏 1 場晉級、再輸 2 場淘汰

### Requirement: Path odds are even and local
尚未定案的系列賽 SHALL 各以 50/50 計入機率。一條走向的機率 SHALL 是這一隊該條勝敗序列的乘積。其他隊伍尚未定案的場次 MUST NOT 改變這個機率，也 MUST NOT 被這個機率填上勝者。

#### Scenario: A 2-1 team has three terminal paths
- **WHEN** 一隊目前為 2 勝 1 敗且下一場尚未定案
- **THEN** 面板列出「勝」50% 晉級、「敗再勝」25% 晉級，以及「敗再敗」25% 淘汰

#### Scenario: Even odds do not fill other matches
- **WHEN** 使用者只檢視一隊的走向機率
- **THEN** 其他隊伍的未定場次仍然沒有勝者

### Requirement: A path is remembered until it is consumed
套用一條走向 SHALL 把該隊後續每一場的勝或敗整條記住。對戰圖上已經存在的場次 SHALL 立刻寫入；尚未配出的後續場次 SHALL 留在該隊的待走步驟。下一輪配對出現後，系統 SHALL 把該隊的下一步自動寫入他所參加的那一場。

#### Scenario: Later step waits for the next round
- **WHEN** 使用者對 2 勝 1 敗的 T1 套用「敗再勝」，且第五輪尚未配出
- **THEN** 第四輪立刻記為 T1 的對手獲勝，T1 仍保留「下一場要勝」

#### Scenario: Queued step applies when the match appears
- **WHEN** T1 保留「下一場要勝」，且之後配出的第五輪包含 T1
- **THEN** 該場自動記為 T1 獲勝，使用者不必再點一次

### Requirement: Unrelated matches stay undecided
套用走向或消化待走步驟 SHALL 只寫入該隊所參加的場次。其他場次 SHALL 保持沒有勝者，直到使用者另行指定，或該場參賽者自己的待走步驟寫入。

#### Scenario: One path does not invent the rest of the round
- **WHEN** 使用者只套用 T1 的一條走向
- **THEN** 第四輪其餘五場仍然沒有勝者，第五輪也不因此配出

### Requirement: Later path wins a conflict
同一場的兩邊都有待走步驟且結果互相矛盾時，系統 SHALL 採用較晚套用的那一步，並 SHALL 捨棄另一隊剩餘的待走步驟。相同快照與相同操作順序 MUST 產生相同對戰圖，且此決定 MUST NOT 使用亂數。

#### Scenario: Both queued sides claim the win
- **WHEN** 新配出的一場兩邊都記著「下一場要勝」，且這兩條走向有先後順序
- **THEN** 較晚套用的那一隊獲勝，較早那一隊的剩餘步驟被捨棄

#### Scenario: Replaying the same actions matches
- **WHEN** 從同一份快照依相同順序重做套用、判勝與對調
- **THEN** 對戰圖與晉級、淘汰結果相同

### Requirement: Manual pick cancels the remaining path
使用者在面板為一場指定勝者時，系統 SHALL 寫入該場，並 SHALL 捨棄該隊尚未走完的待走步驟。快照已有勝者的場次 SHALL 不能在面板中改寫。

#### Scenario: Picking a winner drops the queue
- **WHEN** 一隊仍有待走步驟，且使用者在面板改點該隊目前這一場的勝者
- **THEN** 該場改為所點的勝者，該隊之後的待走步驟不再自動套用

### Requirement: Next round uses one deterministic pairing
當前一輪每一場都有勝者時，系統 SHALL 為仍未晉級且未淘汰的同戰績隊伍配出下一輪。配對 SHALL 先減少重賽、再減少同賽區，並在同樣乾淨的配法中採用隊伍代碼字典序的第一組。相同輸入 MUST 產生相同配對。人數為奇數以致無法配完時，系統 SHALL 停止配對並標明無法配對。

#### Scenario: Round 5 appears after six results
- **WHEN** 第四輪六場都已有勝者，其中包含官方結果、手動判勝或已套用的走向
- **THEN** 系統配出第五輪，並以三場對戰取代 TBD

#### Scenario: The same pool pairs the same way
- **WHEN** 同一組隊伍、既有交手與賽區再次配對
- **THEN** 對戰組合與前一次相同

#### Scenario: An odd pool does not invent a match
- **WHEN** 某個戰績池的隊伍數為奇數
- **THEN** 系統不產生下一輪對戰，並顯示無法配對

### Requirement: Swap exchanges opponents in one pool
「換」SHALL 讓使用者在同一戰績池點選兩隊並交換他們的對手；這兩下點擊 MUST NOT 開啟局面板。系統 SHALL 先清掉被改寫的兩場舊勝者，再把這兩隊仍保留的下一步寫入新對戰。

#### Scenario: Swap mode does not open the panel
- **WHEN** 使用者按下「換」後點選第五輪同一池的兩隊
- **THEN** 這兩隊的對手互換，且這兩下沒有開啟局面板

#### Scenario: A queued step follows the team
- **WHEN** 一隊的下一步是「勝」，且對調把他換到另一場
- **THEN** 新的那一場自動記為該隊獲勝

### Requirement: Clear removes trials only
「清除試算」SHALL 移除所有試算勝者與待走步驟，並將對戰圖恢復成快照。快照中的勝者、晉級與淘汰 SHALL 保留。

#### Scenario: Clear restores the undrawn round
- **WHEN** 使用者已套用走向並產生第五輪，然後按下清除試算
- **THEN** 第四輪回到快照中沒有勝者的狀態，第五輪回到尚未配對，已晉級與已淘汰的官方結果仍在

### Requirement: Three wins advance and three losses eliminate
系列賽累積 3 勝的隊伍 SHALL 顯示為晉級。累積 3 敗的隊伍 SHALL 顯示為淘汰。單場的局數 MUST NOT 改變晉級或淘汰。

#### Scenario: A trial win reaches three wins
- **WHEN** 一隊在 2 勝 1 敗時，試算贏下目前這場系列賽
- **THEN** 該隊顯示為晉級

#### Scenario: Game count is ignored
- **WHEN** 一場已完成的 Bo3 系列賽局數為 2 比 1
- **THEN** 晉級與淘汰只記這場系列賽的勝或敗

### Requirement: Record columns form a centered funnel
系統 SHALL 畫出五欄：0-0；1-0 與 0-1；2-0、1-1 與 0-2；2-1 與 1-2；2-2。每一欄外框 SHALL 在對戰圖高度內垂直置中，整體由左往右收成漏斗。欄位 MUST NOT 使用 Round 1 或第 1 輪這類標題，也 MUST NOT 顯示圖例。

#### Scenario: Every record stage is drawn
- **WHEN** 使用者開啟對戰圖
- **THEN** 0-0 到 2-2 的比賽都在上述五欄中，較短的欄位垂直置中

#### Scenario: Round titles and legends are absent
- **WHEN** 使用者查看對戰圖
- **THEN** 畫面上沒有 Round 1、第 1 輪欄標題，也沒有圖例

### Requirement: A match row is three horizontal cells
每一場 SHALL 在同一列橫排左隊、VS、右隊。兩隊 MUST NOT 上下疊放，也 MUST NOT 各自包成一張卡片。VS 欄寬 SHALL 為 40px，列高 SHALL 至少 54px。種子 SHALL 為 11px，隊伍代號 SHALL 為 24px 的 Impact，VS SHALL 為 20px。畫面 MUST NOT 顯示隊徽。

#### Scenario: Row geometry
- **WHEN** 渲染一場比賽
- **THEN** 左隊、寬 40px 的 VS 與右隊橫向排成一列，列高至少 54px，種子 11px、代號 24px Impact、VS 20px，且沒有隊徽

### Requirement: Centered Worlds header
頁首 SHALL 水平置中顯示 ◆ 與 WORLDS 2026。視窗寬度為 1440px 時，這個大標區塊的高度 SHALL 約為 100px。

#### Scenario: Header at desktop width
- **WHEN** 視窗寬度為 1440px
- **THEN** 頁首中央是 ◆ 與 WORLDS 2026，大標高度約 100px

### Requirement: Swiss stage banner under the title
大標正下方 SHALL 有一條強調藍 `#19b8f0` 的水平漸層橫幅。橫幅 SHALL 寫出 SWISS STAGE，以及快照中尚有官方未定場次的最早一輪，形式為 ROUND N。試算配出較後的輪次時，橫幅 MUST NOT 跟著改輪次。

#### Scenario: Banner shows the official round
- **WHEN** 快照的第四輪仍有沒有官方勝者的場次，且更早各輪都已有官方勝者
- **THEN** 大標下方的藍色漸層橫幅顯示 SWISS STAGE 與 ROUND 4

#### Scenario: Trials do not move the banner
- **WHEN** 使用者試算完第四輪並配出第五輪
- **THEN** 橫幅仍顯示 ROUND 4

### Requirement: Advance slots are labeled by record
3 勝 0 敗的晉級欄 SHALL 標為 1ST/2ND。3 勝 1 敗的晉級欄 SHALL 標為 3RD/4TH/5TH。3 勝 2 敗的晉級欄 SHALL 標為 6TH/7TH/8TH。

#### Scenario: Three advance labels
- **WHEN** 對戰圖畫出晉級欄
- **THEN** 3-0、3-1、3-2 分別標成 1ST/2ND、3RD/4TH/5TH、6TH/7TH/8TH

### Requirement: Night palette
頁面底 SHALL 為參考轉播圖那種深藍夜景。強調藍 SHALL 為 `#19b8f0`，試算金 SHALL 為 `#f5c04a`，淘汰紅 SHALL 為 `#e0566b`。晉級標示 SHALL 使用強調藍，淘汰標示 SHALL 使用淘汰紅。

#### Scenario: Palette is fixed
- **WHEN** 使用者開啟對戰圖
- **THEN** 強調色為 `#19b8f0`、試算色為 `#f5c04a`、淘汰色為 `#e0566b`，底色為深藍夜景

### Requirement: Official, trial, and generated rounds look different
快照已定案的勝方 SHALL 為白字，敗方 SHALL 為半透明。試算勝方 SHALL 為 `#f5c04a`。系統配出的下一輪外框 SHALL 為 `#f5c04a` 的虛線。

#### Scenario: Official result colors
- **WHEN** 一場比賽的勝者來自快照
- **THEN** 勝方為白字且敗方為半透明

#### Scenario: Trial winner is gold
- **WHEN** 一場比賽的勝者來自試算
- **THEN** 勝方為 `#f5c04a`

#### Scenario: Generated round uses a dashed frame
- **WHEN** 系統配出下一輪
- **THEN** 該輪外框為 `#f5c04a` 虛線

### Requirement: Panel lists the team's matches
面板 SHALL 列出這一隊每一場的對手與系列賽勝敗，包含官方結果與已寫入的試算。

#### Scenario: History includes both sources
- **WHEN** 使用者開啟一隊面板，且該隊同時有官方場次與試算場次
- **THEN** 面板列出這些場次的對手與勝敗

### Requirement: A trial pick can be cancelled
面板裡已判過的試算勝負，再對同一個選擇操作一次 SHALL 取消該場試算勝者，並 SHALL 捨棄該隊尚未走完的待走步驟。快照已有的勝者 MUST NOT 被取消。

#### Scenario: Second press clears the trial
- **WHEN** 使用者在面板點了未完成場次的勝者，然後再點一次同一個勝者
- **THEN** 該場回到沒有試算勝者，且該隊剩餘步驟不會立刻寫回

#### Scenario: Official winner stays
- **WHEN** 使用者在面板對快照已有勝者的場次再次操作
- **THEN** 該場勝者不變

### Requirement: Toolbar shows the trial count
頁首工具列 SHALL 顯示目前已寫入試算勝者的場次數，並 SHALL 提供清除試算。尚未寫入場次的待走步驟 MUST NOT 計入該數字。

#### Scenario: Queued steps are not counted
- **WHEN** 使用者套用一條只先寫入一場、其餘仍在佇列的走向
- **THEN** 工具列顯示的試算場數為 1

#### Scenario: Cancelling decreases the count
- **WHEN** 使用者取消一場已寫入的試算勝者
- **THEN** 工具列的試算場數減少 1
