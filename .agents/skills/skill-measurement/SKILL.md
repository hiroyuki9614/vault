---
name: skill-measurement
description: Skill実行のterminal outcomeを、raw promptや業務本文を保存せず、既存Measurement Capabilityへbest-effortで記録してSkill利用・品質・cost比較に使える形へする。
compatibility: ChatGPTおよびAgent Skills互換環境。対象Skillのidentity/version/outcomeと、`measurement/public.ts`または対応HTTP endpointを利用できること。
version: 1.0.0
public_artifact_id: 4a5cb348-ed86-4d73-aa5c-c99c92227978
document_type: skill
status: public_reference
primary_type: guarded_mutate
traits: [evidence_backed, verifiable, may_mutate]
effects: [measurement_write]
---

# Skill Measurement

## Purpose

Skillの利用結果を、Skill本体の成功条件とは分離したoptional telemetryとして記録する。

目的は「計測のためにSkillを使う」ことではなく、実際にmaterialに使われたSkillについて、後から成功率・適用外率・cost・duration・修正量などを比較できるようにすること。

## Applicability

Use when:

- 対象Skillのterminal outcomeが確定した
- Skill利用を継続的に比較・改善するためのtelemetryがmaterial
- Measurement Capabilityとcaller authorityが利用可能

Not applicable when:

- 対象Skillが存在しない、または実行identityを一意にできない
- measurementを取ること自体がsubject workより重くなる
- raw prompt / user input / model output / employee identity等を保存しないと成立しない

## Input

```text
measurement vaultId
stable run UUID
optional parentRunId
target Skill id / version
target Skill terminal outcome
startedAt / finishedAt
optional taskType
optional provider / model / promptRef
optional inputTokens / outputTokens / costMicrousd
optional correctionCount / humanIntervention
measurement/public.ts or POST /v1/measurements/record
```

## Procedure

1. 対象が`skill-measurement`自身なら再帰計測せず`not_applicable`で終了する。
2. 対象Skillのcurrent `name`と`version`を正本から確認する。
3. Measurement commandは`kind = skill`、`name = <skill-id>@<version>`、`skillIds = [<skill-id>]`を基本形にする。
4. target Skillのterminal outcomeをMeasurement statusへそのまま保持する。`completed / not_applicable / blocked / failed`を別の意味へ丸めない。
5. `cancelled`はcallerがSkill run自体を中断した場合だけ使う。
6. provider/model/token/cost等は実際に取得できたaggregateだけを記録し、不明値を推測で補わない。
7. `promptRef`はstable prompt/version referenceが存在する場合だけ使い、prompt本文を入れない。
8. customer/employee identity、document本文、user/model input-output本文、company-specific KPIをPublic Measurementへ入れない。
9. `measurement/public.ts`またはbounded HTTP endpointから1 terminal snapshotをbest-effortで記録する。
10. exact same-run replayは同一run UUIDを再利用する。別内容で同じUUIDを再利用しない。
11. `recorded`なら記録結果を返す。`not_recorded`でも対象Skillのterminal outcomeを失敗へ書き換えない。

## Output

```text
target skill id / version
measurement run id
measurement status
recorded | not_recorded
optional semantic measurement error / retryable
privacy omissions
```

## Terminal outcomes

- `completed`: target Skillのterminal telemetryを記録した、またはbest-effort failureを明示して終了した
- `not_applicable`: 自己計測、measurement不要、または対象Skill identityがない
- `blocked`: required Measurement boundary / authority / target terminal evidenceが不足
- `failed`: privacy boundaryやrun identity conflictにより安全な計測contractを作れない

## Do not

- Measurement failureを対象Skillの失敗へ変換する
- `skill-measurement`自身を再帰的に計測する
- `not_applicable`を`completed`へ丸める
- raw prompt / user input / model output / document bodyをtelemetryへ保存する
- employee rankingやperformance surveillanceをPublic Skillの責務にする
- token/cost/修正回数を推測する
- measurementのためにSkill実行順序やsubject behaviorを変える
- Agent orchestration / scheduler / universal runnerを追加する
