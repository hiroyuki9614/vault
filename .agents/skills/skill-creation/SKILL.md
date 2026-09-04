---
name: skill-creation
description: recurringなAgent作業を新しいPublic Skillとして追加するとき、既存Skillとの重複を避け、distillation contractに沿った最小Skill定義とrouting更新を作る。
compatibility: ChatGPTおよびAgent Skills互換環境。対象repositoryのcanonical instructions、`.agents/SKILLS_INDEX.md`、`docs/SKILL_DISTILLATION.md`を確認できること。
version: 1.0.0
public_artifact_id: 577c87bd-ab74-4b70-afdc-815030816abe
document_type: skill
status: public_reference
primary_type: guarded_mutate
traits: [boundary_analysis, evidence_backed, verifiable, may_mutate]
effects: [repository_write]
---

# Skill Creation

## Purpose

一回限りのpromptやrepository固有手順を安易にSkill化せず、再利用価値のある責務だけをPublic Skillとして追加する。

このSkillはSkill generatorやuniversal Skill runtimeを作るものではない。

## Applicability

Use when:

- 同じ種類のAgent作業が複数回発生し、再利用可能な判断軸・手順・完了条件を固定したい
- 既存Skillではmaterialな責務が不足している
- 新しいSkillをcurrent routing indexへ正本化したい

Not applicable when:

- 既存Skillで十分表現できる
- 一回限りのprompt / project-specific runbookで足りる
- 新しいtaxonomyやrunnerを作ること自体が目的

## Input

```text
candidate Skill responsibility
current repository instructions
.agents/SKILLS_INDEX.md
docs/SKILL_DISTILLATION.md
overlapping Skill candidates
repository write authority when mutation is requested
```

## Procedure

1. candidateが繰り返し再利用されるsemantic responsibilityか確認する。
2. current Skill indexとmaterialに重なるSkillだけを比較する。
3. 既存Skillの小さな拡張で足りる場合は新規Skillを作らず`not_applicable`で終える。
4. `docs/SKILL_DISTILLATION.md`からprimary typeを1つ選び、実在するtraitだけを宣言する。
5. effectを列挙する。`may_mutate`や`effects`をpermission付与として扱わない。
6. uniqueなkebab-case `name`、semantic version、`public_artifact_id`を決める。
7. `.agents/skills/<name>/SKILL.md`へ、少なくともPurpose / Applicability / Input / Procedure / Output / Terminal outcomes / Do notを持つ最小contractを書く。
8. Skill固有classification、false-positive resistance、completion条件をgeneric templateへ潰さない。
9. Measurementはoptional caller concernとして扱い、Skill本体のhard dependencyにしない。
10. `.agents/SKILLS_INDEX.md`へ一意なrouting rowと必要最小限のfamily導線を追加する。
11. repository policyに従ってfocused verificationを実行し、作成したSkillとrouting pathをread-backする。

## Output

```text
skill identity / version
created or updated canonical path
primary type / traits / effects
routing rule
overlap decision
verification evidence
terminal status
```

## Terminal outcomes

- `completed`: 新しいSkill contractとroutingが一意な正本として追加・検証された
- `not_applicable`: 既存Skillまたは通常prompt/runbookで十分
- `blocked`: required canonical、write authority、またはSkill責務の確定材料が不足
- `failed`: overlapやcontract矛盾を解消できず安全に正本化できない

## Do not

- 既存Skill全文をcopyして別名Skillを作る
- Skill数を増やすこと自体を成果にする
- taxonomyをSkillごとに増やす
- universal `execute()` / SkillRunner / orchestration frameworkを作る
- environment/provider固有設定をPublic Skill本文へ埋め込む
- `effects`だけを根拠にrepositoryや外部systemへ書き込む
- Skill作成のたびにmandatory review-of-reviewやledgerを増やす
