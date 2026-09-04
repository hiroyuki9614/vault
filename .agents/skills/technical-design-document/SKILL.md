---
name: technical-design-document
description: durableな設計判断を固定する必要がある時だけ、適切なartifact種別とcanonical boundaryを選び、最小の技術設計書へ整理する。
compatibility: ChatGPTおよびAgent Skills互換環境。対象repositoryの文書規約・current sourceを確認できること。
version: 1.0.0
public_artifact_id: f21be61c-abee-410f-80ef-65140948e94b
document_type: skill
status: public_reference
primary_type: transform
traits: [evidence_backed, verifiable]
effects: []
---

# Technical Design Document

## Purpose

「設計書を作る」という依頼を、そのまま新規文書作成へ変換しない。まずdurableな設計判断を残す必要があるか判定し、必要な場合だけrepositoryの情報architectureに従って最小artifactを作る。

## Applicability

Use when:

- 複数実装・複数文書へ影響するdurable boundary / decision / completion conditionがある
- 設計書・ADR・runbook・progress・handoffのどれがownerか不明
- current文書がmutable statusとdurable designを混ぜている

Not applicable for typo、read-only review、当日操作だけ、単一status更新、implementation detailだけの依頼。

## Input

```text
requested decision / artifact
repository information architecture
existing canonical documents
current implementation facts when material
```

## Artifact decision

必要な場合だけ次から最小ownerを選ぶ。

```text
design
ADR
runbook
progress
handoff
requirements
existing-owner-update
no-document
```

## Procedure

1. repositoryのdocument/canonical policyを先に確認する。
2. 新規文書より既存owner更新で済むか確認する。
3. 新しいartifactが必要なら、その文書が所有する情報と所有しない情報を宣言する。
4. durable boundary / decision / acceptanceだけを書く。
5. SHA、PR、daily status、実行log等のmutable evidenceはdurable designへ固定しない。
6. major software-structure decisionだけ、意味の異なる代替案を比較する。形式的な第二案を捏造しない。
7. secret、実credential、不要なprovider/path current valueを埋め込まない。
8. canonical ownerと重複がないことをread-backする。

## Output

```text
artifact decision
canonical responsibility
minimal durable content
related owner references
completion / verification
```

## Terminal outcomes

- `completed`: 適切なartifact ownerへdurable decisionが一意に固定された
- `not_applicable`: 新規/大幅文書化が不要
- `blocked`: repositoryのcanonical policyまたはrequired decision authorityが不明
- `failed`: duplicate/contradictory canonicalを解消できない

## Do not

- 文書作成を通常作業の儀式にする
- code/schemaから明白なdetailを二重管理する
- current SHA / PR / check結果をdurable designへ固定する
- 実装手順だけのためにarchitecture documentを増やす
- repository固有information architectureを上書きする
