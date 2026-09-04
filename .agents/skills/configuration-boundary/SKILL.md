---
name: configuration-boundary
description: environment variable、provider/model、project/repository、host/port、filesystem path、external endpoint、feature/config値、credential locatorなどの変動値について、literalを一律禁止せずownershipとvariation axisを分類し、必要な値だけtyped config / adapter boundaryへ分離する。
compatibility: ChatGPTおよびAgent Skills互換環境。対象コード、config surface、adapter/composition boundaryを確認できること。
version: 1.0.0
public_artifact_id: fa9c71f6-2793-4b7b-8974-928a1932f26c
document_type: skill
status: public_reference
primary_type: analyze
traits: [classifier, boundary_analysis, evidence_backed, verifiable]
effects: []
---

# Configuration Boundary

## Purpose

「hardcodingを無くす」をliteral禁止にせず、**値のownershipとvariation axisを判定して、変動する外部条件だけをconfiguration / adapter boundaryへ出す**。

```text
runtime / deployment / providerで変動する値
  -> explicit typed config / adapter boundary

安定したdomain invariant
  -> code / typed constant

secret value
  -> secret store / runtime injection

canonical inputから再計算できる値
  -> derive; do not duplicate as config
```

このSkillはmagic-number scannerではない。literalであること自体は違反ではない。

## Applicability

原則trigger:

- environment variable / runtime option
- provider / model / provider-specific option
- project ID / tenant ID / deployment identifier
- repository / host / port
- filesystem root / absolute path
- external endpoint / base URL
- request/runごとに変わるfeature/config value
- credential locator / secret injection boundary
- derived configの重複source-of-truth
- provider/deployment identityのcore / public contractへの漏洩
- materialだがownership不明な値

次だけを理由にtriggerしない。

- literal / magic stringを見つけただけ
- pure algorithmだけの変更
- protocol固定値
- schema discriminator / domain enum
- UI copy / label / test fixture
- ownershipが明確なimplementation-local constant

## Input contract

```text
TARGET = 値 / config lookup / provider identity / boundary
SCOPE  = 今回判定してよいcode / config / adapter / composition slice
```

materialな判定に必要な範囲で確認する。

- current consumer / semantic owner
- authoritative source-of-truth
- deployment / runtime / provider variation requirement
- config ingress / validation boundary
- public Port / domain boundary
- secret valueかcredential locatorか
- derived valueならauthoritative inputs

repository全体のliteralを抽象化候補として全文走査しない。

## Canonical classification

対象値は名前や文字列形式ではなく、**誰が所有し、何を理由に変わるか**で8分類する。

```text
DOMAIN_INVARIANT
IMPLEMENTATION_CONSTANT
DEPLOYMENT_CONFIG
RUNTIME_CONFIG
PROVIDER_CONFIG
SECRET_OR_CREDENTIAL
DERIVED_VALUE
UNKNOWN_MATERIAL
```

### DOMAIN_INVARIANT

domain / protocol / schemaの意味そのものを構成し、deploymentやprovider交換では通常変わらない値。

例: HTTP status、domain enum、schema discriminator、mathematical constant、固定business rule。

Action: code / typed constantへ残す。literalであることだけを理由にenv化しない。

### IMPLEMENTATION_CONSTANT

domain contractではないが、現在のalgorithm / parser / adapter実装方式に閉じた安定値。operatorが調整する契約はない。

Action: ownershipの最も狭いcodeへ置く。

### DEPLOYMENT_CONFIG

deployment、environment、tenant、host、repository配置によって変わる値。

例: project/repository、host/port、filesystem root、deployment URL、tenant/environment ID。

Action: composition/config loaderで取得・validateし、consumerへ最小sliceを渡す。

### RUNTIME_CONFIG

codeやdeploymentを変えず、operator / request / run単位で変わり得るbehavioral input。

例: feature flag、per-run mode、operator-tunable limit/timeout/threshold。

Action: raw runtime sourceをboundaryでparse/validateし、coreにはsemantic typed inputだけ渡す。

### PROVIDER_CONFIG

特定provider / SDK / external serviceにだけ意味を持つidentity・option。

例: provider ID、model ID、provider endpoint/region、SDK option。

Action: composition rootまたはprovider Adapterへ閉じ、domain/public contractではsemantic intentへ変換する。

```text
semantic intent
  -> adapter mapping
  -> provider-specific value
```

### SECRET_OR_CREDENTIAL

認証・認可に使うsecret valueそのもの。

例: API key、password、private key、access/refresh token、database credential。

Action: repository code/config/document/fixtureへ実値を保存しない。secret store / CI secret / runtime injectionから解決する。

**credential locatorはsecret valueではない。** locator名と解決後の実値を別分類する。

### DERIVED_VALUE

他のauthoritative inputから決定的に導出でき、独立設定として持つ必要がない値。

例: host+portから作るbase URL、repository rootから作るsub-path、current stateからfresh取得するrevision ID。

Action: source-of-truthを増やさずderive/resolveする。

### UNKNOWN_MATERIAL

materialな値だが、ownership / variation axis / source-of-truthを現在の証拠から決められない。

Action: env化もconstant化も推測で行わず、必要最小限のcurrent contractを確認する。

## Decision gate

```text
secret実値か?
  yes -> SECRET_OR_CREDENTIAL

authoritative inputから決定的に導出できるか?
  yes -> DERIVED_VALUE

値を変えるとdomain / protocol / schemaの意味そのものが変わるか?
  yes -> DOMAIN_INVARIANT

現在のimplementation方式だけに閉じるか?
  yes -> IMPLEMENTATION_CONSTANT

provider / SDK / external serviceを交換すると変わるか?
  yes -> PROVIDER_CONFIG

deploy / environment / tenant / host配置を変えると変わるか?
  yes -> DEPLOYMENT_CONFIG

同じdeploymentのままoperator / request / runで変わるか?
  yes -> RUNTIME_CONFIG

materialだが証拠不足か?
  yes -> UNKNOWN_MATERIAL
```

## Three independent axes

次の3軸を混同しない。

```text
trigger
  = このSkillをtaskへ適用するか

classification
  = 値が8分類のどれか

boundary_status
  = 現在の配置が valid | invalid | unknown のどれか
```

proposalの採否は必要なら`accept`等の別fieldにする。

## Machine-readable output

```ts
import { z } from 'zod';

const Classification = z.enum([
  'DOMAIN_INVARIANT',
  'IMPLEMENTATION_CONSTANT',
  'DEPLOYMENT_CONFIG',
  'RUNTIME_CONFIG',
  'PROVIDER_CONFIG',
  'SECRET_OR_CREDENTIAL',
  'DERIVED_VALUE',
  'UNKNOWN_MATERIAL',
]);

const BoundaryStatus = z.enum(['valid', 'invalid', 'unknown']);

const Evaluation = z.object({
  trigger: z.boolean(),
  classification: Classification,
  boundary_status: BoundaryStatus,
  accept: z.boolean().optional(),
  reason: z.string().optional(),
});
```

AIはsemantic classificationを担当できるが、enum spelling / schema validity / forbidden aliasはdeterministic validationで保証する。

invalid enumを黙ってalias-normalizeしない。

## Procedure

1. 今回の差分でmaterialなliteral / raw config lookup / provider identityだけを列挙する。
2. 各値の`consumer / owner / variation axis / source-of-truth`を確認する。
3. 8分類のexact enumへ割り当てる。
4. 現在の配置を`valid | invalid | unknown`で判定する。
5. secret実値とcredential locatorを分離する。
6. derived valueを独立configとして重複保持していないか確認する。
7. provider/deployment固有値がcore/public contractへ漏れていればAdapter/composition boundaryへ戻す最小案を出す。
8. domain invariant / implementation constantを形式だけでenv化しない。
9. unknownを推測で埋めない。
10. required changeがある場合も最小差分を示して停止する。

## Output contract

```text
run_status: completed | not_applicable | blocked | failed
trigger: boolean
values:
  - target
    classification
    boundary_status
    rationale
    evidence_reference
proposal_decision: optional
required_changes: minimal changes or none
missing_evidence: only when material
```

## Completion

完了前に確認する。

- classificationはcanonical 8 enumを使用している
- trigger / classification / boundary_statusを混同していない
- secret実値をrepositoryへ保存する提案をしていない
- credential locatorとsecret valueを分離した
- derived valueを第二source-of-truthにしていない
- provider/deployment detailをdomain/public contractへ漏らしていない
- stable domain invariantを無意味にconfig化していない
- unknownを推測で埋めていない
