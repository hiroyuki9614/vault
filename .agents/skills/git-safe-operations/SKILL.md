---
name: git-safe-operations
description: Git管理された資産を変更するとき、既存変更を保持し、今回scopeだけをcommit / publishし、破壊的履歴操作や意図不明な競合解消を避ける。
compatibility: ChatGPTおよびAgent Skills互換環境。GitまたはGitHub上の対象差分とcurrent identityを確認できること。
version: 1.0.0
public_artifact_id: 55e43fd8-55b4-4c5b-8ad0-1df28860ee80
document_type: skill
status: public_reference
primary_type: guarded_mutate
traits: [evidence_backed, verifiable, may_mutate]
effects: [repository_write]
---

# Git Safe Operations

## Purpose

Git操作で、今回と無関係な変更を壊したり混ぜたりせず、**targeted write + current identity + remote read-back**で対象差分だけを安全に保存・統合する。

repository固有のpermission / branch protection / approval ruleがあればそれを優先する。このSkill自身は新しいapproval gateを作らない。

## Start

write前に利用可能な範囲で確認する。

```text
repository / branch / base identity
existing local or remote changes
target paths / hunks
current blob / commit identity
```

既存変更を今回scopeとして扱わない。

## Write rules

- 最小target path / hunkだけを変更する。
- 全変更が今回scopeと確認できない限り一括stageしない。
- file API updateではcurrent blob identityを確認する。
- sequential updateでは直前write後のnew identityを使う。
- generated file / secret / temporary outputの混入を確認する。
- commit / PR / mergeはrepository policyに従う。

## Before publish

```text
scope
unexpected deletion
secret / privacy
relevant verification
base / upstream drift
merge conflict
```

baseが動いていてもmaterial overlapがないなら、無意味な全面rebaseや作業のやり直しを繰り返さない。

## Destructive boundary

通常操作として行わない。

```text
force push
destructive history rewrite
broad reset / clean
unrelated file overwrite
intent不明のconflict resolution
branch protection / permission bypass
```

必要な場合はrepository固有の明示authorizationに従う。

## Conflict rule

conflictでは「CIを通すため」だけで片側を捨てない。

1. 両変更のsemantic intentを確認する。
2. 今回scopeとforeign changeを分ける。
3. intentを保持できる最小resolutionを選ぶ。
4. intentが判定不能ならblock / escalateする。

## Read-back

publish後は可能な範囲でremoteから確認する。

```text
expected target changed
unrelated target not overwritten
published commit / blob exists
relevant verification state known
```

transport responseだけで完了扱いせず、対象identity/contentを再取得できるならread-backする。

## CI boundary

failed CIを見た場合:

- 今回diffに関連するかを先に判定する。
- 関連するfailureはscope内で修正する。
- unrelated failureを理由に無制限にrepair scopeを広げない。
- unknownならunknownとする。

## Do not

- backup目的でsecretをremoteへpushする
- current mainが動くたびに最初からやり直す
- Git操作だけのためにreview stack / recovery subsystemを作る
- unrelated working tree changesを捨てる
- force optionを通常の競合解消として使う

## Output

必要な場合だけ返す。

```text
target_scope
write_identity
verification
read_back
remaining_conflict_or_risk
```

## Terminal outcomes

`completed | not_applicable | blocked | failed`
