---
name: project-initialization
description: greenfieldまたはmajor foundation変更前に、current canonicalとframework conventionから最小foundation contractを作り、実装開始可否を判定する。
compatibility: ChatGPTおよびAgent Skills互換環境。対象repositoryのcanonical instructionと必要なframework sourceを確認できること。
version: 1.0.0
public_artifact_id: aedaa3ee-e4de-417d-b7c0-02cfce1bd141
document_type: skill
status: public_reference
primary_type: analyze
traits: [boundary_analysis, evidence_backed, verifiable]
effects: []
---

# Project Initialization

## Purpose

新しいapplication/service/package、major subsystem、主要dependency/test foundation変更の前に、今回必要なfoundationだけを固定してfeature implementationへ渡す。

project generatorやuniversal architecture templateではない。

## Applicability

Use when:

- greenfield project / service / package
- major subsystem / bounded contextを新設する
- major dependency direction、persistence owner、public boundary、test/build foundationを変える

Not applicable when existing foundationをそのまま再利用できるminor/local change。

## Input

```text
project / bounded scope identity
current canonical instructions
actual requirements
current framework convention when applicable
existing foundation / verification commands
```

## Procedure

1. target repositoryのcanonical instruction mechanismとscopeを解決する。
2. `greenfield / existing_foundation_reuse / bounded_extension`を選ぶ。
3. directory treeより先にresponsibility ownerとpublic/private boundaryを決める。
4. major dependency / persistence / external-service / configuration / secret boundaryだけを固定する。
5. focused test / related check / build等、実装を開始するためのverification baselineを確認する。
6. major architecture decisionに複数案がmaterialに成立する場合だけ比較する。
7. required sourceが不足し結果を変える場合は`STOPPED`。optional evidence不足だけでは過剰停止しない。
8. implementation/TDDへ渡す最小foundation contractを出す。

## Output

```text
project identity / foundation mode
canonical source refs
responsibility / dependency boundaries
external/config/secret boundaries
verification baseline
blocking unresolved items
readiness: READY | CONDITIONAL | STOPPED
```

## Terminal outcomes

- `completed`: implementation開始に必要なfoundation boundaryが明確
- `not_applicable`: existing foundation reuseで十分
- `blocked`: required canonical / requirement / framework contractが不足
- `failed`: contradictory foundation contractを解消できない

## Do not

- framework非依存の固定directory templateを強制する
- line countやmodule数でarchitectureを決める
- major reasonなしにPort/interface/layerを増やす
- full feature designやTDD本体を抱え込む
- project generatorや新しいcontrol machineryをこのSkillのためだけに作る
