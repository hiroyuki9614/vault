---
public_artifact_id: 9a2937d3-b8c4-4ab3-98db-0083bcfba9ae
document_type: design
status: public_reference
---

# Skill Distillation

## Purpose

既存のAgent Skillや長い手順書を、そのままコピーして再利用資産とみなさず、共通mechanicsとSkill固有の意味論へ分離します。

基本モデル:

```text
Base Skill Contract
  -> Primary Type
  -> Orthogonal Traits
  -> Skill-specific Semantics
```

目的は全Skillを同じ文章templateへ揃えることではありません。

```text
common mechanicsは1回だけ定義する
実行責務の違いをtypeで表す
横断特性をtraitで表す
Skill固有の分類軸・意味論は保持する
```

## Distillation acceptance

Skillを蒸留済みと扱う最低条件:

1. source Skillの目的とmaterial semanticsを特定する。
2. common mechanicsとSkill固有logicを分離する。
3. primary typeを1つ選ぶ。
4. 実際に該当するtraitだけ宣言する。
5. input / output / applicability / effect boundaryを明示する。
6. terminal outcomeを明示する。
7. classification vocabulary等の固有意味論を保持する。
8. generic procedureを各Skill本文へ重複して埋め込まない。
9. current runtime sourceとrouting indexを一意にする。
10. 古いcopyを第二正本として維持しない。

## Base Skill Contract

共有してよい最小contract:

```text
identity
version
description
applicability
input contract
output contract
effect declaration
terminal outcome
completion / stop semantics
```

共通terminal outcomeの例:

```text
completed
not_applicable
blocked
failed
```

- `completed`: Skill固有の完了条件を満たした。
- `not_applicable`: 対象がSkillの責務外。正常終了。
- `blocked`: scope内だがrequired source / permission / contract等が不足。
- `failed`: Skillを実行したが完了条件を満たせなかった。

Skill固有の`UNKNOWN`などの分類結果とrun statusは混同しません。

## Primary types

初期taxonomyの一例:

```text
analyze
guarded_mutate
diagnose_repair
advise
transform
```

### analyze

```text
evidence / source
 -> analysis / classification
 -> rationale / result
```

通常はsubjectを直接変更しません。

### guarded_mutate

```text
current identity / scope
 -> bounded write plan
 -> permission / destructive boundary
 -> mutation
 -> same-subject verification
```

write intent自体がSkill責務に含まれます。

### diagnose_repair

```text
observe
 -> locate first failure boundary
 -> hypothesis
 -> optional bounded repair
 -> verify
```

repairは診断に従属するoptional escalationです。

### advise

```text
semantic input
 -> reasoning / reframing
 -> advisory output
```

人間の最終authorityを置換しません。

### transform

```text
source meaning
 -> audience / representation transformation
 -> semantic-preservation check
```

対象domain stateを変更しません。

## Traits

初期traitの一例:

```text
classifier
boundary_analysis
evidence_backed
verifiable
may_mutate
```

Traitは必要なものだけ付与します。

### classifier

明示されたclassification axisを持ちます。共通化できるのはtarget / applicability / result / rationale / evidence reference程度までに留め、classification enum自体はSkill固有にします。

### boundary_analysis

責務、依存、effect、configurationなどの境界を分析するclassifier familyを表します。

### evidence_backed

結論をsource / observation / diff / runtime evidenceなどへ結び付けます。巨大な共通Evidence modelを作る必要はありません。

### verifiable

Skill固有のdefinition of doneを機械的または明示的に確認できます。形式的なboolean proofが意味を壊すSkillには付けません。

### may_mutate

Skillの一部pathが外部effectを要求し得ることを宣言します。

```text
may_mutate
  != permission granted
```

権限はconsumer / repository側が決定します。

## What should stay Skill-specific

次は安易に共通化しません。

```text
classification vocabulary
classification meaning
evidence semantics
domain-specific procedure
repair strategy
mediation semantics
pedagogical strategy
Skill-specific completion condition
false-positive resistance
```

共通interfaceへ押し込むことで意味が薄くなるなら、共通化しない方が安全です。

## Measurement boundary

MeasurementをSkill本体のhard dependencyにしません。

```text
caller / composition root
  -> Skill execution
  -> Skill outcome
  -> optional Measurement
```

観測基盤の障害をSkill semantic failureへ自動変換しないようにします。

## Distillation flow

```text
inventory exact source
 -> identify stable semantic responsibility
 -> classify primary type
 -> attach only real traits
 -> extract repeated mechanics
 -> preserve Skill-specific semantics
 -> remove environment/provider coupling
 -> compare overlapping Skills
 -> promote one current source
 -> update routing index
 -> consumer adopts explicitly
```

## Machine projection

Consumerは蒸留済みcontractをmachine-readable representationへ投影できます。

```ts
type SkillStatus =
  | "completed"
  | "not_applicable"
  | "blocked"
  | "failed";

type SkillType =
  | "analyze"
  | "guarded_mutate"
  | "diagnose_repair"
  | "advise"
  | "transform";

interface SkillDefinition<I, O> {
  id: string;
  version: string;
  type: SkillType;
  traits: readonly string[];
  effects: readonly string[];
  run(input: I): Promise<{ status: SkillStatus; output?: O }>;
}
```

これは例であり、universal Skill Runnerを作る要求ではありません。

## Anti-patterns

```text
old Skill文書をcopyして蒸留完了扱いする
全Skillを巨大なexecute()へ集約する
全classifierのenumを1 unionへ潰す
全Skillのevidenceを1 schemaへ押し込む
traitを形式のためだけに付ける
may_mutateだけでpermissionを得た扱いにする
Measurementを全Skillのrequired dependencyにする
Skill利用を理由にreview / workflow / ledgerを自動生成する
```

## Revisit condition

Taxonomyは実際のSkillが既存type/traitでmaterialに表現できない場合にだけ変更します。Skill数やfile数が増えただけではtypeを増やしません。
