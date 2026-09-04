---
name: test-driven-development
description: behavior changeを、期待理由で失敗するRed、最小Green、Refactor、fresh再実行の順で進め、後付けtestをTDD証拠として扱わない。
compatibility: Agent Skills互換環境。対象code/testと安全なtest commandを確認できること。
version: 1.0.0
public_artifact_id: c987149e-acde-48fc-812f-b7930b0dbd03
document_type: skill
status: public_reference
primary_type: guarded_mutate
traits: [evidence_backed, verifiable, may_mutate]
effects: [repository_write]
---

# Test Driven Development

## Purpose

観測可能なbehavior changeに対し、**実装前のfail evidenceから最小実装へ進む**ことで、testが実装の追認だけになることを防ぐ。

`may_mutate` / `repository_write`は可能なeffectの宣言であり、write permissionそのものではない。実変更はrepository policyとcaller authorityに従う。

## Applicability

Use for:

- 新機能
- bugfix
- behavior-changing refactor

Normally not for:

- docs-only
- 短命spike
- behaviorを変えないtest-only調査

## Input

```text
confirmed behavior / acceptance
existing tests
safe test command / environment
change target
```

## Procedure

1. testで観測するbehaviorを固定する。
2. implementation前にtestを追加しfresh実行する。
3. **意図した理由でRedになったか**確認する。
4. Greenに必要な最小実装だけを行う。
5. target + relevant testsをfresh実行する。
6. 必要なRefactorを行う。
7. target + relevant testsを再度fresh実行する。

## Red validity

次は正しいRedとして数えない。

```text
test environment failure
fixture setup failure
missing import / syntax failure unrelated to target behavior
network/provider outage unrelated to acceptance
```

Redは「期待behaviorがまだ実装されていないため、期待したassertionで失敗した」ことを示す必要がある。

## Minimal Green

Green時に同時に行わないもの:

- unrelated cleanup
- speculative abstraction
- unrelated feature
- coverage threshold追加
- security / retry / logging等の別要件追加

materialに必要なら別scopeとして扱う。

## Evidence

完了時に必要な範囲で次を残す。

```text
red_evidence
green_evidence
relevant_test_results
refactor_summary
unchecked_scope
remaining_risk
```

## Do not

- Redを省略してTDD完了とする
- implementation後に追加したtestをRed evidenceと呼ぶ
- test未実行を成功扱いする
- external reference取得をhard dependencyにする
- coverage数値だけをTDD completionにする
- full test suiteを常に必須にする

## Terminal outcomes

`completed | not_applicable | blocked | failed`

`completed`には、valid Red、最小Green、必要なRefactor後のfresh relevant test successが含まれる。
