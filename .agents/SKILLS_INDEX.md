---
public_artifact_id: ec4b685b-1300-4e17-988b-52e99856705b
document_type: index
status: public_reference
---

# Public Vault Skills Index

必要なSkillだけを読む。全Skillの全文走査を既定にしない。

| Skill | Use when | Path |
|---|---|---|
| project-initialization | greenfield / major foundation変更で実装開始前の最小boundaryとreadinessを決める | `.agents/skills/project-initialization/SKILL.md` |
| requirements-interview | material requirement gapが実装結果を分岐させ、current evidenceだけでは一意に決まらない | `.agents/skills/requirements-interview/SKILL.md` |
| change-impact-analysis | 既存変更の処理経路を追い、MUST_CHANGE / CHECK_ONLY / NO_CHANGEを分ける | `.agents/skills/change-impact-analysis/SKILL.md` |
| technical-design-document | durable decisionをどのartifact ownerへ残すべきかを決める | `.agents/skills/technical-design-document/SKILL.md` |
| deployment-diagnosis | deploy / DNS / TLS / proxy / process / DB等のfirst broken boundaryを観測から特定する | `.agents/skills/deployment-diagnosis/SKILL.md` |
| requirements-guard | current requirement、canonical、implementation、testsの矛盾や反映漏れがmaterial | `.agents/skills/requirements-guard/SKILL.md` |
| test-driven-development | 新機能・bugfix・behavior changeをvalid Redから最小Greenへ進める | `.agents/skills/test-driven-development/SKILL.md` |
| qa-quality-assurance | 利用者/事業riskからtest conditionと優先度を設計する | `.agents/skills/qa-quality-assurance/SKILL.md` |
| secure-coding-guard | input、DB、output、auth、file、secret、dependency等のsecurity boundaryがmaterial | `.agents/skills/secure-coding-guard/SKILL.md` |
| git-safe-operations | repository writeで既存変更保持、targeted mutation、remote read-backが必要 | `.agents/skills/git-safe-operations/SKILL.md` |
| dependency-boundary | ownership、public/private境界、dependency direction、foreign internal access、cycle、hard dependencyがmaterial | `.agents/skills/dependency-boundary/SKILL.md` |
| functional-decomposition | meaningful decisionとI/O・clock・random・environment等が同じ処理に絡む | `.agents/skills/functional-decomposition/SKILL.md` |
| configuration-boundary | runtime/deployment/provider/secret/derived valueのownershipとvariation axisがmaterial | `.agents/skills/configuration-boundary/SKILL.md` |
| skill-creation | recurringなAgent作業を新しいPublic Skillとして正本化し、重複回避・type/trait/effect・routingを固定する | `.agents/skills/skill-creation/SKILL.md` |
| skill-measurement | target Skillのterminal outcomeを既存Measurementへprivacy-minimizedかつbest-effortで記録する | `.agents/skills/skill-measurement/SKILL.md` |

## Skill families

### Project lifecycle

```text
新しいproject / major foundationをどう始めるか?
  -> project-initialization

実装結果を変える要件不足があるか?
  -> requirements-interview

既存変更はどこまで波及するか?
  -> change-impact-analysis

durableな設計判断をどこへ残すか?
  -> technical-design-document

deploy障害はどの境界で最初に壊れたか?
  -> deployment-diagnosis
```

### Development flow

```text
何がcurrent requirementか?
  -> requirements-guard

behavior changeをRedから実装するか?
  -> test-driven-development

何をどの優先度でtestすべきか?
  -> qa-quality-assurance

security-sensitive boundaryがあるか?
  -> secure-coding-guard

Git writeを安全に保存・publishするか?
  -> git-safe-operations
```

### Architecture boundary

```text
誰が何を所有し、どこへ依存するか?
  -> dependency-boundary

判断と外部effectを分けるべきか?
  -> functional-decomposition

この値はcode / config / provider / secret / derivedのどこに属するか?
  -> configuration-boundary
```

### Skill lifecycle / observability

```text
新しい再利用Skillを追加すべきか、どう正本化するか?
  -> skill-creation

実行済みSkillを比較可能なtelemetryとして残すか?
  -> skill-measurement
```

## Shared contract

共通のSkill設計原則は [`docs/SKILL_DISTILLATION.md`](../docs/SKILL_DISTILLATION.md) を参照する。

代表的なrun status:

```text
completed
not_applicable
blocked
failed
```

Skill固有classificationとrun statusを混同しない。

## Routing rule

- Skill使用自体を目的にしない。
- taskへmaterialな判定軸だけを使う。
- 複数Skillを使う場合も責務を混ぜない。
- `effects` / `may_mutate`はpermission付与ではない。
- unknownを推測で埋めない。
- verificationは今回scopeに関連するものだけを使う。
- 完了後に追加review / workflow / ledgerを自動生成しない。
