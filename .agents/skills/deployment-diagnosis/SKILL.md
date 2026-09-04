---
name: deployment-diagnosis
description: デプロイ、公開、proxy、TLS、process、container、DB接続等の障害を、推測による設定変更ではなく観測事実から最初に壊れている境界へ絞り込む。
compatibility: ChatGPTおよびAgent Skills互換環境。対象環境の状態、設定、log、HTTP応答等を可能な範囲で確認できること。
version: 1.0.0
public_artifact_id: 860dfb85-274b-4da2-9b22-faec91b15b2c
document_type: skill
status: public_reference
primary_type: diagnose_repair
traits: [evidence_backed, verifiable, may_mutate]
effects: []
---

# Deployment Diagnosis

## Purpose

公開・デプロイ障害を、思いつきの設定変更ではなく「最後に成功した境界 / 最初に失敗した境界」から診断する。

このSkillは診断方法を所有する。host固有のpermission、secret、Production authorization、runtime identityはenvironment側が所有する。

## Applicability

Use when:

- URLへ接続できない、statusが想定と違う
- TLS / DNS / proxy / app process / containerで止まる
- localでは動くがremote環境で失敗する
- DB / SMTP / external API接続で失敗する
- CI/CDやdeployの失敗layerが不明

原因が既に確定した単純修正や、app内部だけのunit-test failureには使わない。

## Diagnostic model

症状に関係する層だけを外側から内側へ確認する。

```text
client
  -> DNS / route
  -> TCP / port / firewall
  -> TLS
  -> web / proxy
  -> app process
  -> config / secret availability
  -> DB / external service
  -> data / migration
```

全層を儀式的に確認しない。

## Observe before mutate

最初に固定する。

```text
expected behavior
actual symptom
impact
last known success
recent material change
repro / status / log evidence
```

## Procedure

1. 期待・症状・影響を確認する。
2. 最小のread-only evidenceを取る。
3. success boundary / first failure boundaryを特定する。
4. 仮説を最大3件へ絞り、それぞれに根拠と反証方法を付ける。
5. mutationが必要ならauthorityとrollback / safe-stopを確認する。
6. 最小修正を1つだけ行う。
7. 同じboundaryを再確認する。
8. internal / external / user-visible acceptanceを必要な範囲で確認する。
9. 原因、修正、確認済み範囲、未確認を短く報告する。

## Safety boundary

- secret本文を回答やlogへ出さない
- data削除、credential変更、permission拡張、public exposureを診断都合で勝手に行わない
- broad reset / rebuildを最初の手段にしない
- read-only診断まで不要に止めない
- environment固有policyが要求するauthorizationを迂回しない
- 復旧中に大規模refactorや基盤移行を混ぜない

## Output

```text
expected / symptom
last success
first failure
hypothesis + evidence
repair (if any)
verification
remaining unknown
```

## Terminal outcomes

`completed | not_applicable | blocked | failed`

## Do not

- status codeや単一logだけでroot causeを断定する
- 複数設定を同時に変更して原因を不明にする
- recoveryとredesignを同じ完了条件にする
- may_mutateをpermission grantedと解釈する
