---
name: requirements-interview
description: 実装結果を変えるmaterialな要件不足だけを、current evidence確認後に必要最小限の質問で解消する。
compatibility: ChatGPTおよびAgent Skills互換環境。対象の正本・実ファイルを確認できること。
version: 1.0.0
public_artifact_id: 14016c0d-960e-4990-a43f-4584f686c52e
document_type: skill
status: public_reference
primary_type: analyze
traits: [evidence_backed, verifiable]
effects: []
---

# Requirements Interview

## Purpose

要件不足のため複数のmaterialに異なる実装が成立する時だけ、実装可能な最低限の要件を決める。

このSkillは質問票を全部聞く仕組みではない。確認できる事実を再質問せず、結果を変えるunknownだけを人間へ戻す。

## Applicability

Use when:

- 利用者・主要flow・保存/出力・権限・重要rule・acceptanceの不足が実装結果を変える
- current canonical / implementation / testsだけでは一意に決められない
- 実装中にmaterial requirement gapが判明した

Not applicable when:

- current requirementが十分で変更も明確
- 誤字等のnon-behavioral change
- implementation optionだけを比較している
- unknownが結果を変えない

## Input

```text
current task
relevant canonical/evidence
known requirement facts
material unknowns
```

## Procedure

1. current explicit instructionと関係するcanonical / implementation / testsだけを読む。
2. `known / material_unknown / non_material_unknown`へ分ける。
3. material unknownを、利用者の動作・保存・権限・受入結果が分かる質問へ変換する。
4. 独立して答えられる質問は少数にまとめる。1回答で後続が大きく変わる場合だけ分岐質問を先にする。
5. 回答後、current requirement ownerへ確定内容を反映する。会話logを第二正本にしない。
6. 必要なら確定後の整合確認へ渡す。

## Output

```text
confirmed facts
material questions
resolved requirement / remaining blocker
canonical owner to update
```

## Terminal outcomes

- `completed`: material unknownが解消され、実装判断が一意になった
- `not_applicable`: material requirement gapがない
- `blocked`: required evidenceまたはhuman decisionが取得不能
- `failed`: 質問してもacceptanceに必要な要件を確定できない

## Do not

- 実ファイルで分かることを再質問する
- AIが合理的な仕様を補完する
- 形式的に全質問カテゴリを聞く
- 過去会話をcurrent canonicalより優先する
- requirement logを第二正本として増やす
- requirement不足を理由に追加workflowやreview stackを作る
