---
name: functional-decomposition
description: meaningful decisionと外部I/O・clock・random・environment・共有可変状態などが同じ処理に絡むとき、観測済みdecisionだけをpure coreへ抽出しeffectをthin shellへ残す。単なるcomponent/file小分けやline-count削減には使用しない。
compatibility: ChatGPTおよびAgent Skills互換環境。対象コードとcurrent behaviorを確認できること。
version: 1.0.0
public_artifact_id: 0dfba91c-d2e5-4f2e-b573-2f0ce0cb5ab4
document_type: skill
status: public_reference
primary_type: analyze
traits: [classifier, boundary_analysis, evidence_backed, verifiable]
effects: []
---

# Functional Decomposition

## Purpose

コードをファイル数や行数ではなく、**meaningful decision と externally observable effect / nondeterministic input の境界**で分解する。

Functional Core / Imperative Shellを最小適用し、すべてをpure化する規則にはしない。

## Applicability

次のAとBが同じ処理へ絡むとき適用する。

```text
A: meaningful decision
validation / calculation / transformation / state transition /
routing / authorization predicate / policy selection

B: effect or nondeterministic input
network / DB / filesystem / clock / random / environment /
browser storage / external mutation / provider SDK / shared mutable state
```

原則`KEEP`:

- effectだけのthin/trivial adapter
- async / Promiseがあるだけ
- local temporary mutationだけ
- meaningful decisionがない
- decisionが既にpure coreとして分離済み

## Input contract

```text
OUTCOME = current user/domain-visible behavior to preserve or implement
SCOPE   = 今回変更してよい処理・component・module・owner
```

必要な範囲だけcurrent code、actual effect、transaction/lifecycle/ordering、provider値のsemantic meaningを読む。repository全体をpure化候補として走査しない。

## Classification

```text
DECOMPOSE
KEEP
BLOCKED_UNKNOWN
```

### DECOMPOSE

観測済みdecisionとeffectが不必要に絡み、behaviorを変えずdecisionをpure coreへ抽出できる。

```text
acquire external input
  -> pure decision
  -> dispatch result
  -> external effect
```

clock / random / environmentが必要ならshellで値を取得してcoreへ渡す。形式のためだけにClockProvider等を作らない。

### KEEP

現在の境界で十分。

```text
required_changes: none
```

helper、interface、module移動、test、comment、cleanupをこのSkill由来のrequired changeにしない。

### BLOCKED_UNKNOWN

sourceは読めているが、安全なpure resultまたはeffect boundaryを決めるmaterial semanticsが不足している。

```text
required_changes: none
safe_action: no code change at the uncertain boundary
missing_evidence: minimum material evidence only
```

未知のbranch / enum / fallback / provider semanticsを推測で補完しない。

## Evidence rule

**観測できたruleだけを抽出し、補完しない。**

強いevidence:

- current condition / calculation / transformation
- actual I/O / mutation / nondeterministic input
- transaction / ordering / lifecycle
- provider value semantics
- caller-visible result / state transition

次だけでは確定しない。

```text
line/file count
async / Promise alone
local temporary mutation alone
mock presence alone
"Clean Architectureだから"
```

## Scope / minimality

required patchはdecision/effect separationに必要な差分だけにする。

明示要件がない限り、次を同じpatchへ追加しない。

- retry / timeout / fallback
- cleanup
- loading / cache
- new validation
- logging / telemetry
- idempotency
- transaction / lock / concurrency変更
- new auth/security behavior
- unrelated UI behavior

pure coreは確認済みdecisionを表す最小単位にする。1つの条件+計算を1関数で表せるなら、独立した意味・再利用・変更軸なしに過分割しない。

## Multi-stage effects

外部結果が次のdecision inputになる場合は、小さなstageを繰り返す。

```text
acquire A -> pure decide A -> effect A
          -> acquire B -> pure decide B -> effect B
```

generic command DSLへ押し込まない。

## React / Next.js

fetchとdomain predicateが同じeffectへ混在するなら、確認済みpredicateだけをpure functionへ抽出し、fetch / promise chain / setState / dependency array / lifecycle behaviorは保持する。

既存にないcleanupやerror handlingをついでに追加しない。

## Procedure

1. `OUTCOME` / `SCOPE` / current observable behaviorを固定する。
2. effect / nondeterministic inputを列挙する。
3. meaningful decisionが同じ処理へ絡むか判定する。
4. materialでなければ`not_applicable`、分離不要なら`KEEP`。
5. 混在するなら観測済みdecisionだけを最小pure core候補にする。
6. safe shapeを決めるsemanticが不足すれば`BLOCKED_UNKNOWN`。
7. shellへ既存effect ordering / transaction / error / lifecycle semanticsを残す。
8. scope外改善を混ぜない。
9. `DECOMPOSE`時だけpure coreをreal external I/Oなしで確認できることを検証する。
10. classificationと最小decisionが確定したら停止する。

## Output contract

```text
run_status: completed | not_applicable | blocked | failed
outcome: DECOMPOSE | KEEP | BLOCKED_UNKNOWN
observed_decision:
effects:
pure_core:
shell_or_adapter:
required_changes:
missing_evidence:
out_of_scope_observations:
material_evidence:
```

不変条件:

```text
KEEP            -> required_changes: none
BLOCKED_UNKNOWN -> required_changes: none
```

## Completion

完了前に確認する。

- pure coreへI/O / clock / random / env / provider SDKを漏らしていない
- 未知semantic / branch / pathを発明していない
- thin adapterを形式だけで分割していない
- transaction / concurrencyを推測していない
- pure coreを過分割していない
- scope外改善をrequired changeへ混ぜていない

満たしたら追加review/document/refactorを自動生成せず停止する。
