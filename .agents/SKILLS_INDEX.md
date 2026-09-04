---
public_artifact_id: ec4b685b-1300-4e17-988b-52e99856705b
document_type: index
status: public_reference
---

# Public Vault Skills Index

必要なSkillだけを読む。全Skillの全文走査を既定にしない。

| Skill | Use when | Path |
|---|---|---|
| dependency-boundary | ownership、public/private境界、dependency direction、foreign internal access、cycle、hard dependencyがmaterial | `.agents/skills/dependency-boundary/SKILL.md` |
| functional-decomposition | meaningful decisionとI/O・clock・random・environment等が同じ処理に絡む | `.agents/skills/functional-decomposition/SKILL.md` |
| configuration-boundary | runtime/deployment/provider/secret/derived valueのownershipとvariation axisがmaterial | `.agents/skills/configuration-boundary/SKILL.md` |

## Shared contract

3 Skillはいずれも`analyze`型で、次のtraitを持つ公開referenceです。

```text
classifier
boundary_analysis
evidence_backed
verifiable
```

共通のSkill設計原則は [`docs/SKILL_DISTILLATION.md`](../docs/SKILL_DISTILLATION.md) を参照してください。

## Routing rule

- Skill使用自体を目的にしない。
- taskへmaterialな判定軸だけを使う。
- 複数Skillを使う場合も責務を混ぜない。
- Skillは分析・分類結果を返す。repository mutation権限を自動付与しない。
- unknownを推測で埋めない。
- 完了後に追加review / workflow / ledgerを自動生成しない。

代表的な使い分け:

```text
誰が何を所有し、どこへ依存するか?
  -> dependency-boundary

判断と外部effectを分けるべきか?
  -> functional-decomposition

この値はcode / config / provider / secret / derivedのどこに属するか?
  -> configuration-boundary
```
