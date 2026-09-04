---
name: requirements-guard
description: 変更前後にcurrent requirement・canonical・implementation・testsを照合し、古い仕様、矛盾、反映漏れ、推測を検出する。
compatibility: ChatGPTおよびAgent Skills互換環境。対象の正本または実ファイルを確認できること。
version: 1.0.0
public_artifact_id: 4fd9f477-a93e-4412-bccb-d1da9e073a4f
document_type: skill
status: public_reference
primary_type: analyze
traits: [classifier, evidence_backed, verifiable]
effects: []
---

# Requirements Guard

## Purpose

変更を始める前後に、**現在の要件・実装事実・補助資料・推測を分離し、同じcontractへ収束させる**。

このSkillは要件を勝手に決めない。materialな矛盾とunknownを検出し、安全な変更scopeを明確にする。

## Applicability

Use when:

- 新機能、仕様変更、bugfix
- API / DB / validation / auth等の外部contract変更
- 仕様変更が複数回あった対象
- document / tests / implementationの不一致が疑われる

通常は不要:

- 明確な誤字修正
- 一般質問
- 捨てる前提の小さなspike

## Evidence roles

情報を少なくとも次へ分ける。

```text
current explicit instruction
current canonical / accepted contract
current tests and implementation
history / discussion
automatic inference
```

「新しい発言だから」だけで既存canonicalを黙って上書きしない。一方、明示された仕様変更は過去contractより優先され得る。

実ファイルを確認できない場合、確認済みと主張しない。

## Classification

```text
confirmed
candidate
implementation_fact
unknown
```

- `confirmed`: current requirementとして根拠がある
- `candidate`: 提案・未確定案
- `implementation_fact`: 現在code/testがしていること。仕様そのものとは限らない
- `unknown`: 結果へ影響するがcurrent evidenceで確定できない

## Procedure

1. 今回変えるobservable behaviorを一文で固定する。
2. 関係するcanonicalだけを読む。
3. current implementation / testsを確認する。
4. evidenceを4分類する。
5. materialな矛盾だけを列挙する。
6. 明示された変更ならcanonical・implementation・testsを同じcontractへ収束させる。
7. unknownが結果を変える場合だけ確認またはblockする。
8. 完了時にcanonical・implementation・testsがmaterialに一致するか確認する。

## Output

必要な場合だけ短く返す。

```text
confirmed_requirement
material_conflict_or_unknown
safe_change_scope
verification
```

矛盾がなければ長い監査報告を作らず主作業へ進む。

## Do not

- historyだけでcurrent requirementを断定する
- codeを常に仕様書扱いする
- 多数決で要件を決める
- AI推測だけで矛盾を解消する
- 今回に無関係な古い仕様を全面整理する
- requirements確認を理由にreview / registry / workflowを増殖させる

## Terminal outcomes

`completed | not_applicable | blocked | failed`
