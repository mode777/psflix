# JS Event Hooks

PocketBase JS event hooks allow you to execute custom code at specific points in the application lifecycle. All hooks follow the same pattern:

```js
onXxx((e) => {
  // your logic
  e.next(); // continue the hook chain
});
```

Throwing an error or not calling `e.next()` stops the hook chain and prevents the operation from completing.

## App Lifecycle Hooks

```js
onBootstrap((e) => {
  console.log('App is bootstrapping');
  e.next();
});

onSettingsReload((e) => {
  console.log('Settings were reloaded');
  e.next();
});

onBackupCreate((e) => {
  console.log('Backup is being created');
  e.next();
});

onBackupRestore((e) => {
  console.log('Backup is being restored');
  e.next();
});

onTerminate((e) => {
  console.log('App is shutting down');
  e.next();
});
```

## Mailer Hooks

```js
onMailerSend((e) => {
  console.log('Sending email to:', e.to);
  e.next();
});

onMailerRecordAuthAlertSend((e) => {
  console.log('Auth alert for:', e.record.email);
  e.next();
});

onMailerRecordPasswordResetSend((e) => {
  console.log('Password reset requested by:', e.record.email);
  e.next();
});

onMailerRecordVerificationSend((e) => {
  console.log('Verification email for:', e.record.email);
  e.next();
});

onMailerRecordEmailChangeSend((e) => {
  console.log('Email change for:', e.record.email);
  e.next();
});

onMailerRecordOTPSend((e) => {
  console.log('OTP sent to:', e.record.email);
  e.next();
});
```

## Realtime Hooks

```js
onRealtimeConnectRequest((e) => {
  console.log('Client connecting to realtime');
  e.next();
});

onRealtimeSubscribeRequest((e) => {
  console.log('Client subscribing to:', e.client.subscriptions());
  // e.client - the realtime client
  // e.record - the record being subscribed to (if applicable)
  e.next();
});

onRealtimeMessageSend((e) => {
  console.log('Realtime message:', e.message);
  e.next();
});
```

## Record Model Hooks

Record hooks fire for all record types (auth, base, view, etc.) unless you filter by collection:

```js
onRecordEnrich((e) => {
  // Add custom computed fields to the serialized record
  e.record.set('computedField', 'some value');
  e.next();
});

onRecordValidate((e) => {
  console.log('Validating record:', e.record.id);
  e.next();
});

// Create lifecycle
onRecordCreate((e) => {
  console.log('Record about to be created');
  e.next();
});

onRecordCreateExecute((e) => {
  console.log('Record insert executing');
  e.next();
});

onRecordAfterCreateSuccess((e) => {
  console.log('Record created successfully:', e.record.id);
  e.next();
});

onRecordAfterCreateError((e) => {
  console.log('Record creation failed:', e.error);
  e.next();
});

// Update lifecycle
onRecordUpdate((e) => {
  console.log('Record about to be updated');
  e.next();
});

onRecordUpdateExecute((e) => {
  console.log('Record update executing');
  e.next();
});

onRecordAfterUpdateSuccess((e) => {
  console.log('Record updated successfully:', e.record.id);
  e.next();
});

onRecordAfterUpdateError((e) => {
  console.log('Record update failed:', e.error);
  e.next();
});

// Delete lifecycle
onRecordDelete((e) => {
  console.log('Record about to be deleted');
  e.next();
});

onRecordDeleteExecute((e) => {
  console.log('Record delete executing');
  e.next();
});

onRecordAfterDeleteSuccess((e) => {
  console.log('Record deleted successfully:', e.record.id);
  e.next();
});

onRecordAfterDeleteError((e) => {
  console.log('Record deletion failed:', e.error);
  e.next();
});
```

### Filtering by Collection

Use `.bind()` or collection-specific hooks to target specific collections:

```js
// Only fires for "posts" collection
onRecordCreate((e) => {
  console.log('Post being created:', e.record.get('title'));
  e.next();
}).bind('posts');

// Collection-specific hooks (PocketBase v0.23+)
onCollectionRecordCreate('posts', (e) => {
  console.log('Post being created:', e.record.get('title'));
  e.next();
});
```

## Collection Model Hooks

```js
onCollectionValidate((e) => {
  console.log('Validating collection:', e.collection.name);
  e.next();
});

onCollectionCreate((e) => {
  console.log('Collection about to be created');
  e.next();
});

onCollectionCreateExecute((e) => {
  console.log('Collection create executing');
  e.next();
});

onCollectionAfterCreateSuccess((e) => {
  console.log('Collection created:', e.collection.name);
  e.next();
});

onCollectionAfterCreateError((e) => {
  console.log('Collection creation failed:', e.error);
  e.next();
});

onCollectionUpdate((e) => {
  console.log('Collection about to be updated');
  e.next();
});

onCollectionUpdateExecute((e) => {
  console.log('Collection update executing');
  e.next();
});

onCollectionAfterUpdateSuccess((e) => {
  console.log('Collection updated:', e.collection.name);
  e.next();
});

onCollectionAfterUpdateError((e) => {
  console.log('Collection update failed:', e.error);
  e.next();
});

onCollectionDelete((e) => {
  console.log('Collection about to be deleted');
  e.next();
});

onCollectionDeleteExecute((e) => {
  console.log('Collection delete executing');
  e.next();
});

onCollectionAfterDeleteSuccess((e) => {
  console.log('Collection deleted:', e.collection.name);
  e.next();
});

onCollectionAfterDeleteError((e) => {
  console.log('Collection deletion failed:', e.error);
  e.next();
});
```

## Record Request Hooks

These hooks fire when records are accessed via the API:

```js
onRecordsListRequest((e) => {
  console.log('Listing records of:', e.collection.name);
  e.next();
});

onRecordViewRequest((e) => {
  console.log('Viewing record:', e.record.id);
  e.next();
});

onRecordCreateRequest((e) => {
  console.log('API create request for:', e.collection.name);
  e.next();
});

onRecordUpdateRequest((e) => {
  console.log('API update request for:', e.record.id);
  e.next();
});

onRecordDeleteRequest((e) => {
  console.log('API delete request for:', e.record.id);
  e.next();
});
```

## Auth Request Hooks

```js
onRecordAuthRequest((e) => {
  console.log('Auth request for:', e.record.email);
  e.next();
});

onRecordAuthRefreshRequest((e) => {
  console.log('Token refresh for:', e.record.email);
  e.next();
});

onRecordAuthWithPasswordRequest((e) => {
  console.log('Password auth for:', e.record.email);
  e.next();
});

onRecordAuthWithOAuth2Request((e) => {
  console.log('OAuth2 auth for:', e.record.email);
  // e.provider - the OAuth2 provider name
  e.next();
});

onRecordRequestPasswordResetRequest((e) => {
  console.log('Password reset requested:', e.record.email);
  e.next();
});

onRecordConfirmPasswordResetRequest((e) => {
  console.log('Password reset confirmed:', e.record.email);
  e.next();
});

onRecordRequestVerificationRequest((e) => {
  console.log('Verification requested:', e.record.email);
  e.next();
});

onRecordConfirmVerificationRequest((e) => {
  console.log('Verification confirmed:', e.record.email);
  e.next();
});

onRecordRequestEmailChangeRequest((e) => {
  console.log('Email change requested:', e.record.email);
  e.next();
});

onRecordConfirmEmailChangeRequest((e) => {
  console.log('Email change confirmed:', e.record.email);
  e.next();
});

onRecordRequestOTPRequest((e) => {
  console.log('OTP requested:', e.record.email);
  e.next();
});

onRecordAuthWithOTPRequest((e) => {
  console.log('OTP auth for:', e.record.email);
  e.next();
});
```

## Batch Request Hooks

```js
onBatchRequest((e) => {
  console.log('Batch request received with', e.batch.length, 'items');
  e.next();
});
```

## File Request Hooks

```js
onFileDownloadRequest((e) => {
  console.log('File download:', e.record.id, e.fileField);
  e.next();
});

onFileTokenRequest((e) => {
  console.log('File token requested for:', e.record.id);
  e.next();
});
```

## Collection Request Hooks

```js
onCollectionsListRequest((e) => {
  console.log('Listing collections');
  e.next();
});

onCollectionViewRequest((e) => {
  console.log('Viewing collection:', e.collection.name);
  e.next();
});

onCollectionCreateRequest((e) => {
  console.log('Creating collection via API');
  e.next();
});

onCollectionUpdateRequest((e) => {
  console.log('Updating collection:', e.collection.name);
  e.next();
});

onCollectionDeleteRequest((e) => {
  console.log('Deleting collection:', e.collection.name);
  e.next();
});

onCollectionsImportRequest((e) => {
  console.log('Importing collections');
  e.next();
});
```

## Settings Request Hooks

```js
onSettingsListRequest((e) => {
  console.log('Listing settings');
  e.next();
});

onSettingsUpdateRequest((e) => {
  console.log('Updating settings');
  e.next();
});
```

## Base Model Hooks

These apply to all models (collections, records, admins, etc.):

```js
onModelValidate((e) => {
  e.next();
});

onModelCreate((e) => {
  e.next();
});

onModelCreateExecute((e) => {
  e.next();
});

onModelAfterCreateSuccess((e) => {
  e.next();
});

onModelAfterCreateError((e) => {
  e.next();
});

onModelUpdate((e) => {
  e.next();
});

onModelUpdateExecute((e) => {
  e.next();
});

onModelAfterUpdateSuccess((e) => {
  e.next();
});

onModelAfterUpdateError((e) => {
  e.next();
});

onModelDelete((e) => {
  e.next();
});

onModelDeleteExecute((e) => {
  e.next();
});

onModelAfterDeleteSuccess((e) => {
  e.next();
});

onModelAfterDeleteError((e) => {
  e.next();
});
```

## Common Event Properties

Most hooks receive these common properties on the `e` object:

| Property        | Type         | Description                           |
| --------------- | ------------ | ------------------------------------- |
| `e.record`      | `Record`     | The record being operated on          |
| `e.collection`  | `Collection` | The collection of the record          |
| `e.request`     | `Request`    | The HTTP request (request hooks only) |
| `e.httpContext` | `Context`    | The HTTP context                      |
| `e.error`       | `Error`      | The error (error hooks only)          |

---

> **Source:** [pocketbase.io](https://pocketbase.io/docs/js-event-hooks/)
