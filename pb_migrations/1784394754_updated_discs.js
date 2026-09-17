/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4136889881")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_bur2gj1tj4` ON `discs` (`serial`)",
      "CREATE UNIQUE INDEX `idx_66aonrvieo` ON `discs` (\n  `game`,\n  `index`\n)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4136889881")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_bur2gj1tj4` ON `discs` (`serial`)"
    ]
  }, collection)

  return app.save(collection)
})
