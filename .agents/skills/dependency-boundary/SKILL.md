---
name: dependency-boundary
description: 非自明な実装・refactorでsemantic ownership、public/private境界、dependency direction、change axisを判定し、必要な依存は保ちながら循環・foreign internal access・不要なhard dependency・framework/provider leakageを防ぐ。
compatibility: ChatGPTおよびAgent Skills互換環境。対象コード、import/call/storage境界、関連するpublic contractを参照できること。
version: 1.0.0
public_artifact_id: 71a98bea-f354-43ce-81eb-8320576b6d50
document_type: skill
status: public_reference
primary_type: analyze
traits: [classifier, boundary_analysis, evidence_backed, verifiable]
effects: []
---

# Dependency Boundary

## Purpose

コードを細かいファイルへ分割するのではなく、**semantic ownership・public/private boundary・dependency direction・change axis**を揃え、意味変更が不要に他ownerへ伝播しない最小の依存境界を判定する。

```text
decoupling != abstraction maximization
```

必要な依存は残す。問題にするのは、ownerをまたぐ内部実装依存、循環、不要なhard prerequisite、外部detail漏出である。

基本形:

```text
caller / composition root
        ↓
public contract / Port
        ↓
owned Core
        ↓
owned Adapter
        ↓
external effect
```

foreign ownerは相手の公開境界だけを使う。

```text
foreign owner -> target public contract / Port      OK
foreign owner -> target core / adapter / internal  NG
foreign owner -> target private table              NG
```

## Applicability

Use when:

- module / service / capability / feature boundaryを新設または変更する
- dependency directionを変更する
- framework / provider / DB detailがcore/public contractへ漏れている
- circular importまたはmaterial dependency cycleがある
- foreign ownerの`core / adapter / internal / storage`を直接参照している
- 1つのsemantic changeで無関係なmodule / registryまで同期修正が必要になる
- god module / god service / global mutable singletonへ複数change axisが集中している
- optionalなMeasurement / logging / cache / tracingがbusiness operationの必須条件になっている
- orchestration層がprovider、storage、domain rule、measurementを同時に知り始めている

Return `not_applicable` when ownershipやdependency graphがmaterialではない小さな変更、private helper整理、line count削減だけの分割など。

## Input contract

最低限次を固定する。

```text
OUTCOME = user/domain-visibleな意味変更
SCOPE   = 今回変更してよいowner / module / boundary
```

必要な範囲だけ次を確認する。

- relevant import / call / wait-for edge
- public contract / Port
- semantic ownerを示すcurrent design
- storage / RPC / provider / framework boundary
- caller composition

repository全体を抽象化候補として全文走査しない。

## Output contract

materialなedgeごとに次を返す。

```text
edge / target
semantic owner
requirement classification
boundary classification
graph/certainty classification
rationale
material evidence
minimal correction or keep-as-is
```

共通run status:

```text
completed
not_applicable
blocked
failed
```

`UNKNOWN_MATERIAL`はrun statusではなく、分析は完了したがmaterialなowner/dependency classificationを証拠から確定できないことを表す。

## Ownership test

各責務について確認する。

1. そのinvariant / ruleの意味を決めるownerは誰か。
2. その責務が変わる主な理由は何か。
3. そのchange axisを自然に閉じ込められるownerは誰か。
4. callerが必要なのはsemantic contractか内部実装detailか。
5. 同じ責務を複数ownerが独立に決めていないか。

ownerはファイル配置ではなく、意味・invariant・change axisで決める。

```text
same syntax + different reason to change
  -> 別ownerでよい

same invariant + same owner + duplicated decision
  -> consolidate candidate
```

cycleを切るためだけにowner未確定helperを`shared/common/utils`へ移さない。

## Dependency classification

materialなedgeを3軸で分類する。

### Requirement axis

```text
REQUIRED_DEPENDENCY
  owner責務の実行・解釈に本当に必要。

OPTIONAL_COMPOSITION
  Measurement / logging / cache / tracing / notification等、callerが外側で追加できるconcern。
```

### Boundary axis

```text
PUBLIC_CONTRACT_DEPENDENCY
  ownerをまたぐが、相手のpublic contract / Portだけへ依存する許可形。

INTERNAL_COUPLING
  同一owner内部のprivate implementation dependency。

FORBIDDEN_CROSS_BOUNDARY_ACCESS
  foreign ownerのcore / adapter / internal / private schema / DB table / RPC implementationへ直接依存する形。
```

### Graph / certainty axis

```text
CYCLE
  material dependency graphまたはruntime wait-for graphが循環する。

UNKNOWN_MATERIAL
  owner、requirement、public contract、変更影響のいずれかがcurrent evidenceでもmaterialに確定できない。
```

`UNKNOWN_MATERIAL`を推測でrequired/optionalへ変換しない。

## Evidence semantics

強いevidence:

- import / call / wait-for edge
- public API / Port definition
- owner metadata / architecture contract
- physical storage access
- provider/framework type exposure
- caller/composition wiring
- 1 semantic changeに必要なcross-owner変更

弱いsignalだけで確定しない:

- line count
- file count
- class count
- duplicate lines alone
- 「SOLID違反っぽい」だけ

## Structural smells

調査対象になる強い兆候:

```text
DEPENDENCY_CYCLE
FOREIGN_INTERNAL_ACCESS
CROSS_DOMAIN_DIRECT_DB_ACCESS
FRAMEWORK_TYPE_LEAKAGE
PROVIDER_TYPE_LEAKAGE
ADAPTER_IMPLEMENTATION_LEAKAGE
GOD_MODULE
GLOBAL_MUTABLE_SINGLETON
UNNECESSARY_HARD_DEPENDENCY
OPTIONAL_CONCERN_BECOMES_MANDATORY
MULTIPLE_OWNERS_FOR_ONE_RESPONSIBILITY
CHANGE_AMPLIFICATION
SHOTGUN_SURGERY
ORCHESTRATION_KNOWS_TOO_MUCH
```

smellを1件見つけただけで大規模refactorを始めない。

## Procedure

1. `OUTCOME` / `SCOPE`を固定する。
2. semantic ownerを決める。決められなければ`UNKNOWN_MATERIAL`。
3. callerからmaterialなcalleeまでimport / call / type / storage / wait-for edgeを必要範囲だけ追う。
4. 各edgeをRequirement / Boundary / Graph-certaintyで分類する。
5. forbidden access、cycle、不要なhard dependencyがあれば最小修正案を選ぶ。
6. cross-owner callerは相手のpublic semantic contractを使う。
7. external mechanicsがcoreへ侵入するならPort admission testを行う。
8. optional concernはsubject operationの外側でcomposeする。
9. change amplificationをsemantic owner単位で再確認する。
10. keep-as-isを含む最小decisionを出したら停止する。

Minimal correction order:

```text
existing public boundaryを使う
 -> ownerを一意化する
 -> dependency directionを直す
 -> optional concernをcompositionへ戻す
 -> 必要なら最小Port / Adapter
 -> それでも不足する時だけ新abstraction
```

## Port admission test

Port / interfaceは少なくとも1つの実在する境界理由がある場合だけ候補にする。

- DB / HTTP / filesystem / clock / provider SDK等のexternal effect boundary
- foreign ownerとのstable semantic contract
- coreからexternal mechanicsを隠す必要
- 実在するreplacement requirement
- 明確なchange axisを隔離しないとowner責務へdetailが漏れる

次だけなら作らない。

- testでmockしたいだけ
- 将来差し替えるかもしれないだけ
- SOLID / Clean Architectureの形式を満たしたいだけ
- private pure helperをinterface化したいだけ

implementationが1つでもreal external boundaryがあれば最小Portは成立し得る。

## Framework / provider boundary

```text
owned semantic contract
  -> owned Port
  -> framework/provider Adapter
```

framework type、provider response shape、provider固有IDをdomain/public contractのcanonical identityへしない。

## Storage ownership boundary

```text
Capability A
  -> Capability B public semantic contract / Port
  -> B-owned Adapter
  -> B-owned storage
```

foreign physical storageへの直接アクセスはread-onlyでも避ける。

## Optional concern boundary

Measurement / logging / tracing / cache等がsubject semanticsではない場合:

```text
caller / composition root
  +-> subject operation
  +-> optional concern
```

subject successをoptional concernの成功へ依存させない。

## Completion

次を満たしたら`completed`として停止する。

- material edgeが必要範囲で分類されている
- unknownは推測で埋めていない
- correctionは最小である
- foreign internal accessをpublic contractへ戻せるか評価した
- optional concernをhard dependencyへ昇格させていない
- 不要な新interface / registry / orchestratorを作っていない
