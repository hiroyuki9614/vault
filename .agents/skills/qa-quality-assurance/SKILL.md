---
name: qa-quality-assurance
description: 機能・変更・release候補について、利用者成果と事業影響からquality riskを整理し、具体的test condition、優先度、対象外、残留riskを設計する。
compatibility: Agent Skills互換環境。変更scope、acceptance、既存test、利用者影響を確認できること。
version: 1.0.0
public_artifact_id: 75cd213f-f592-4050-9f37-9f1feff604cb
document_type: skill
status: public_reference
primary_type: analyze
traits: [classifier, evidence_backed, verifiable]
effects: []
---

# QA Quality Assurance

## Purpose

利用者・事業・data・運用への失敗影響から、**何をどの優先度で確認すべきか**をrisk-based test conditionへ変換する。

このSkillはtest実装・実行やrelease最終承認を所有しない。

## Applicability

Use when:

- quality riskやtest範囲を設計する
- release候補の確認観点を決める
- 複数boundaryを跨ぐ変更でtest優先度を整理する

Normally not for:

- 既知の単一test実装
- 単なるtest command実行
- specialist領域の最終合否
- release authorityだけの判断

## Input

```text
user outcome / acceptance
change and impact scope
data / auth / external boundaries
existing tests
available environment / time
explicit exclusions
```

## Procedure

1. 利用者成果と失敗した場合のimpactを固定する。
2. material riskを抽出する。
3. 必要な粒度で`impact / likelihood / detectability`を評価する。
4. riskを具体的test conditionへ変換する。
5. Unit / Integration / E2E / Manual / Specialist候補へ割り当てる。
6. P0〜P3の優先度、対象外、残留riskを明示する。
7. requirement contradictionが見つかったらrequirements ownerへ戻す。

## Useful test-design forms

状況に応じて使う。

```text
boundary value
state transition
decision table
negative path
permission matrix
retry / duplicate submission
external dependency failure
migration / backward compatibility
```

形式を使うこと自体を目的にしない。

## Priority

```text
P0: failureが致命的。release判断に直接影響
P1: 高影響・高頻度または回復困難
P2: 中程度。主要path後に確認
P3: 低影響・補助的
```

精密な数値scoreを根拠なく作らない。

## Output

```text
quality_risks
prioritized_test_conditions
candidate_test_levels
specialist_handoff
excluded_scope
remaining_risk
```

## Do not

- 「全部testする」で優先順位を放棄する
- test実行authorityへ越境する
- release authorityへ越境する
- 根拠のない数値scoreを作る
- coverageだけでqualityを代表させる
- test設計のために不要なworkflow/reviewを増殖させる

## Terminal outcomes

`completed | not_applicable | blocked | failed`
