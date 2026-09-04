---
name: change-impact-analysis
description: 既存システムの変更前に、実ファイルから処理経路と依存関係を追い、必須変更・確認のみ・変更不要を分けて実装漏れとscope拡大を防ぐ。
compatibility: ChatGPTおよびAgent Skills互換環境。対象repositoryまたは実ファイルを検索・参照できること。
version: 1.0.0
public_artifact_id: 5ec281b1-7af8-496c-be1a-317068a455be
document_type: skill
status: public_reference
primary_type: analyze
traits: [classifier, evidence_backed, verifiable]
effects: []
---

# Change Impact Analysis

## Purpose

変更前に必要な経路だけを実ファイルから追い、変更漏れと「関係しそうだから全部直す」を同時に防ぐ。

## Applicability

Use when:

- API / DB / form / state / auth等が複数layerへ波及し得る
- バグ原因と修正対象が一致するか不明
- 既存機能へ項目・条件・出力を追加する
- 実装後の反映漏れが疑われる

一ファイルで閉じる明確な修正や、要件未確定のアイデア出しには使わない。

## Trace model

必要な範囲だけ次を追う。

```text
entry
  -> validation / contract
  -> domain decision
  -> persistence / external effect
  -> output / consumer
  -> tests / acceptance evidence
```

検索hitをそのまま変更対象にしない。各hitの責務とruntime経路を確認する。

## Classification

```text
MUST_CHANGE
CHECK_ONLY
NO_CHANGE
UNKNOWN_MATERIAL
```

- `MUST_CHANGE`: acceptanceを満たすため変更が必須
- `CHECK_ONLY`: 影響確認は必要だが変更は未確定
- `NO_CHANGE`: 経路上materialだが変更不要
- `UNKNOWN_MATERIAL`: 結果を変える不明点が残る

## Procedure

1. 利用者から見た変更を一文で定義する。
2. relevant canonical / entry pointだけを確認する。
3. inputからoutputまで必要な処理・データ経路を追う。
4. caller / callee / storage / external effect / testへの影響を分類する。
5. `MUST_CHANGE`だけを実装scopeにする。
6. `CHECK_ONLY`は確認し、要件上不要なら変更しない。
7. verificationを変更対象と対応付ける。
8. acceptanceが満たせる範囲を確定した時点で探索を終了する。

## Output

```text
change statement
MUST_CHANGE
CHECK_ONLY
NO_CHANGE (important only)
verification
material unknowns
```

## Terminal outcomes

`completed | not_applicable | blocked | failed`

## Do not

- 文字列検索hitを全変更する
- 影響調査を全repository監査へ拡大する
- 変更と無関係なrefactorを混ぜる
- optional dependencyを「念のため」必須化する
- 調査結果から新しいWorkflow / review / registryを自動生成する
