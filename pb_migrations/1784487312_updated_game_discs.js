/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3254013153")

  // update collection data
  unmarshal({
    "viewQuery": "select discs.serial as id, (games.title || ' (Disc ' || (discs.\"index\"+1) || ')') AS title, discs.iso as file\nfrom games\njoin discs on games.id = discs.game\norder by games.title"
  }, collection)

  // remove field
  collection.fields.removeById("_clone_zXiz")

  // add field
  collection.fields.addAt(2, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_kykg",
    "maxSelect": 0,
    "maxSize": 1073741824,
    "mimeTypes": null,
    "name": "file",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": null,
    "type": "file"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3254013153")

  // update collection data
  unmarshal({
    "viewQuery": "select discs.serial as id, (games.title || ' (Disc ' || (discs.\"index\"+1) || ')') AS title, discs.iso as file\nfrom games\njoin discs on games.id = discs.game"
  }, collection)

  // add field
  collection.fields.addAt(2, new Field({
    "help": "",
    "hidden": false,
    "id": "_clone_zXiz",
    "maxSelect": 0,
    "maxSize": 1073741824,
    "mimeTypes": null,
    "name": "file",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbs": null,
    "type": "file"
  }))

  // remove field
  collection.fields.removeById("_clone_kykg")

  return app.save(collection)
})
