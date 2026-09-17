/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_3024945815")

  // add field
  collection.fields.addAt(4, new Field({
    "help": "",
    "hidden": false,
    "id": "select1707694708",
    "maxSelect": 0,
    "name": "mounted",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "select",
    "values": [
      "not_mounted",
      "slot1",
      "slot2"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3024945815")

  // remove field
  collection.fields.removeById("select1707694708")

  return app.save(collection)
})
