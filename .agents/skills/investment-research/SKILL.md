---
name: investment-research
description: 投資関連の調査を、確認可能な事実・推論・判断・未確認事項へ分離して保存する。
---

# Investment Research

## 目的

投資対象を調べる際、ニュースや価格情報をそのまま売買判断へ変換せず、根拠と判断を分離する。

## 出力区分

- `Facts`: 一次情報・信頼できる出典から確認できる内容
- `Interpretation`: Factsからの解釈
- `Risks / Counterpoints`: 反対材料・下振れ要因
- `Unknowns`: 未確認事項
- `Decision`: 本人が採用した場合だけ記録する判断

## 保存

- 個人のthesis / watchlist / portfolioは `30_Areas/Investing/`。
- 二人の共同判断へ昇格する場合はユーザーの明示指示を必須とする。
- `hr-vault` へ共有する場合は、対象repositoryの `AGENTS.md` と `config/permissions.yml` を確認し、action/path/conditionのallowを確認できる場合だけwriteする。
- 共有writeとread-backが成功した共同情報は `hr-vault` を共同正本とし、個人側へ同じ共同本文を第二正本として残さない。
- 市場価格など頻繁に変わる機械状態は、Markdownへ大量蓄積せず外部データストア/collectorを候補とする。

## 注意

AIの評価を本人の投資方針として確定しない。肯定材料だけでなく反対材料も残す。

target permission policyを読めない、または明示allowを確認できないshared writeは行わない。
