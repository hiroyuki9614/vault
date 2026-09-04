---
name: secure-coding-guard
description: Webアプリケーションの変更境界から検査強度を選び、既存の静的解析・secret scan・dependency scan・CIと、認可・業務ロジック・情報境界のAIレビューを組み合わせる。
compatibility: Agent Skills互換環境。対象diff、security関連設定、利用可能な検査結果を確認できること。
version: 1.0.0
public_artifact_id: 0f86e9ae-bfe0-40c9-9d77-11122232fe83
document_type: skill
status: public_reference
primary_type: analyze
traits: [classifier, evidence_backed, verifiable]
effects: []
---

# Secure Coding Guard

## Purpose

実装完了後の一括確認だけに頼らず、変更途中からsecurity riskを検出する。

このSkillはAIだけで脆弱性scannerを再実装しない。**既存の実績ある検査tool + AIによる意味境界review**を組み合わせる。

## Applicability

Use when change touches:

- API / form / URL parameter / Cookie / HTTP header等のexternal input
- SQL / ORM / dynamic query
- HTML / Markdown / rich text / redirect / download filename
- login / session / admin / authorization
- file upload/download/path/public storage
- OS command / external process
- sensitive or personal data
- token / API key / environment secret
- dependency add/update
- explicit security review request

Normally not for pure wording/CSS changes with no input/output/auth/dependency effect.

## Input

```text
changed files / diff
input sources
intermediate stores
output contexts
DB/API/file/process boundaries
authentication principal / target resource / required permission
sensitive data / secret handling
dependency changes
available lint / SAST / secret / dependency / CI checks
```

## Review intensity

`light | standard | enhanced`から選び理由を残す。

認証・認可・sensitive data・file・public APIを含む場合は強い側へ倒す。短納期だけを理由に重大boundaryを省略しない。

## Procedure

1. diffとdata/effect boundaryを確認する。
2. review intensityを選ぶ。
3. repositoryに既にあるsecurity関連checkを確認する。
4. 利用可能なlint/SAST/secret/dependency/CIを実行または結果確認する。
5. toolで見落としやすいsemantic boundaryをAI reviewする。
6. findingをseverity分類する。
7. 修正後は同じ観点をre-checkする。
8. 未実行・未確認を明示し、安全を過剰主張しない。

## AI boundary review

### SQL / query

- external valueをSQL文字列へ連結していないか
- valueはparameterizeされているか
- table/column/order/operator等のstructureはknown internal valueへmappingされているか
- validationとparameterizationを混同していないか
- stored dataを再利用する地点も確認したか

### Output context

- HTML body / attribute / URL / script contextに適した出力か
- `Location`, `Content-Disposition`, Cookie, custom header, mail headerへunsafe inputを流していないか
- stored dataも最終output地点で再評価しているか

### Authentication / authorization

別々に確認する。

```text
access control: そのsurfaceへ到達してよいか
authentication: server側で主体を確定しているか
authorization: その主体が対象resourceへその操作をしてよいか
```

client由来ID、hidden menu、推測困難URLをauthorization代替にしない。

### File / command

- shellをlibrary APIで代替できないか
- inputをcommand/pathへ直接連結していないか
- MIME / extension / size / generated name / storage location / execution permissionを制限しているか
- public areaへbackup/log/source/configを置いていないか

### Secret / data

- secretがcode / diff / log / exception / response / client bundleへ出ないか
- sensitive dataの最小化と公開範囲が妥当か
- Cookie / CORS / CSRF / redirectが用途に合うか
- retry/duplicate submissionで不正状態にならないか

## Severity

```text
Critical: 即時悪用、認証回避、secret流出等。修正まで停止
High: 権限侵害、重大漏洩、実用的注入。原則修正まで停止
Medium: 条件付き悪用。修正または明示保留
Low: defense-in-depth / maintenance
False Positive: 誤検知根拠あり
Unverified: tool/環境/情報不足
```

findingでは可能な範囲で次を分ける。

```text
root cause
root fix
interim mitigation
residual risk
re-check result
```

## Output

```text
review_intensity + reason
executed_checks
unexecuted_checks
findings: severity / evidence / impact / fix / residual risk
boundary_review
completion: pass | conditional | stop | unverified
```

## Completion

`completed`には少なくとも以下を含む。

- review intensityが明確
- 実行/未実行checkが明確
- unresolved Critical/Highがない
- authorization等のmaterial requirementが確認できている
- secret leakageを確認した
- 修正対象をre-checkした

## Stop / block

次では安全と断定しない。

- unresolved Critical / High
- authorization requirement unknown
- secretがhistoryへ入った可能性
- required checkを実行不能
- false positive除外根拠なし
- scopeを区別できない

## Do not

- AI reviewだけで「安全」を保証する
- security toolを無断で大量導入する
- tool successだけでbusiness authorizationを保証する
- interim mitigationだけでroot issue解決扱いする
- penetration testの代替を主張する

## Terminal outcomes

`completed | not_applicable | blocked | failed`
