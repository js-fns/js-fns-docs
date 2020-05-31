#!/usr/bin/env node

import admin from 'firebase-admin'
import { pick } from 'js-fns'
import { stringify } from 'json-bond'
import { add, batch, id, update, value, get, ref, set } from 'typesaurus'
import db, { Page } from './db'
import { TypeDocFunction, TypeDocLibrary } from './typedoc'
import { readFileSync } from 'fs'
import path from 'path'

const version = process.env.VERSION
const versionRegExp = /^v\d+\.\d+\.\d+(-(alpha|beta|rc)(\.\d+)?)?$/
const preReleaseRegExp = /-(alpha|beta|rc)(\.\d+)?$/

if (!version || !versionRegExp.test(version)) {
  console.error(`(•̀o•́)ง VERSION is invalid "${version}"`)
  process.exit(1)
}

const preRelease = preReleaseRegExp.test(version)

const jsonPath = path.resolve(process.cwd(), process.argv[2])
const libraryJSON = readFileSync(jsonPath, 'utf8')
const library = JSON.parse(libraryJSON) as TypeDocLibrary

admin.initializeApp()

const packageName = library.name

const fnPages: Page[] = library.children.map((tsdoc: TypeDocFunction) => {
  const { name } = tsdoc
  const category = findCategory(tsdoc) || 'Common'
  const summary = findSummary(tsdoc) || ''
  return {
    type: 'tsdoc',
    package: packageName,
    version,
    slug: name,
    category,
    title: name,
    summary,
    name,
    tsdoc: stringify(tsdoc),
  }
})

const pagesBatch = batch()
const packageRef = ref(db.packages, packageName)

Promise.all([
  get(packageRef).then((packageDoc) =>
    packageDoc
      ? update(packageRef, {
          versions: value('arrayUnion', [{ version, preRelease }]),
        })
      : set(packageRef, {
          name: packageName,
          versions: [{ version, preRelease }],
        })
  ),

  add(db.versions, {
    package: packageName,
    version,
    preRelease,
    pages: fnPages.map((page) =>
      pick(page, ['slug', 'category', 'title', 'summary'])
    ),
  }),

  Promise.all(
    fnPages.map((page) =>
      id().then((pageId) => pagesBatch.set(db.pages, pageId, page))
    )
  ).then(() => pagesBatch.commit()),
]).then(() => {
  console.log('(ﾉ◕ヮ◕)ﾉ*:・ﾟ✧ Done!')
  process.exit(0)
})

function findCategory(tsdoc: TypeDocFunction) {
  const category = library.groups[0].categories.find((category) =>
    category.children.includes(tsdoc.id)
  )
  return category?.title
}

function findSummary(tsdoc: TypeDocFunction) {
  for (const signature of tsdoc.signatures) {
    const summary = signature.comment?.shortText
    if (summary) return summary
  }
}
