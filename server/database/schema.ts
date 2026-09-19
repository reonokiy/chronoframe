import { sql } from 'drizzle-orm'
import {
  pgTable,
  text,
  integer,
  serial,
  timestamp,
  boolean,
  jsonb,
  doublePrecision,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type { NeededExif } from '~~/shared/types/photo'

type PipelineQueuePayload =
  | {
      type: 'photo'
      storageKey: string
      eraseLocation?: boolean
    }
  | {
      type: 'live-photo-video'
      storageKey: string
    }
  | {
      type: 'photo-reverse-geocoding'
      photoId: string
      latitude?: number | null
      longitude?: number | null
    }
  | {
      type: 'photo-erase-location'
      photoId: string
    }

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    username: text('name').notNull(),
    email: text('email'),
    oidcIssuer: text('oidc_issuer').notNull(),
    oidcSubject: text('oidc_subject').notNull(),
    avatar: text('avatar'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    isAdmin: integer('is_admin').default(1).notNull(),
  },
  (t) => [uniqueIndex('users_oidc_identity').on(t.oidcIssuer, t.oidcSubject)],
)

export const photos = pgTable('photos', {
  id: text('id').primaryKey().unique(),
  title: text('title'),
  description: text('description'),
  width: integer('width'),
  height: integer('height'),
  aspectRatio: doublePrecision('aspect_ratio'),
  dateTaken: text('date_taken'),
  storageKey: text('storage_key'),
  thumbnailKey: text('thumbnail_key'),
  fileSize: integer('file_size'),
  lastModified: text('last_modified'),
  originalUrl: text('original_url'),
  thumbnailUrl: text('thumbnail_url'),
  thumbnailHash: text('thumbnail_hash'),
  tags: jsonb('tags').$type<string[]>(),
  exif: jsonb('exif').$type<NeededExif>(),
  // 地理位置信息
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  country: text('country'),
  city: text('city'),
  locationName: text('location_name'),
  // LivePhoto 相关字段
  isLivePhoto: integer('is_live_photo').default(0).notNull(),
  livePhotoVideoUrl: text('live_photo_video_url'),
  livePhotoVideoKey: text('live_photo_video_key'),
})

export const pipelineQueue = pgTable('pipeline_queue', {
  id: serial('id').primaryKey(),
  payload: jsonb('payload')
    .$type<PipelineQueuePayload>()
    .notNull()
    .default({
      type: 'photo',
      storageKey: '',
    } satisfies PipelineQueuePayload),
  priority: integer('priority').default(0).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  status: text('status', {
    enum: [
      'pending', // Waiting to be processed
      'in-stages', // Currently being processed
      'completed', // Successfully processed
      'failed', // Processing failed
    ],
  })
    .notNull()
    .default('pending'),
  statusStage: text('status_stage', {
    enum: [
      'preprocessing',
      'metadata',
      'thumbnail',
      'exif',
      'motion-photo',
      'reverse-geocoding',
      'live-photo',
      'location-erase',
    ],
  }),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  completedAt: timestamp('completed_at', { withTimezone: true }),
})

// 照片表态表
export const photoReactions = pgTable('photo_reactions', {
  id: serial('id').primaryKey(),
  photoId: text('photo_id')
    .notNull()
    .references(() => photos.id, { onDelete: 'cascade' }),
  reactionType: text('reaction_type', {
    enum: ['like', 'love', 'amazing', 'funny', 'wow', 'sad', 'fire', 'sparkle'],
  }).notNull(),
  // 使用指纹而不是 IP 地址，更准确且支持匿名用户
  fingerprint: text('fingerprint').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

// 相簿表
export const albums = pgTable('albums', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  coverPhotoId: text('cover_photo_id').references(() => photos.id, {
    onDelete: 'set null',
  }),
  isHidden: boolean('is_hidden').default(false).notNull(),
  // Album sort position (ascending; smaller value appears first)
  position: doublePrecision('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

// 相簿-照片 多对多关系表
export const albumPhotos = pgTable('album_photos', {
  id: serial('id').primaryKey(),
  albumId: integer('album_id')
    .notNull()
    .references(() => albums.id, { onDelete: 'cascade' }),
  photoId: text('photo_id')
    .notNull()
    .references(() => photos.id, { onDelete: 'cascade' }),
  position: doublePrecision('position').notNull().default(1000000),
  addedAt: timestamp('added_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
})

export const settings = pgTable(
  'settings',
  {
    id: serial('id').primaryKey(),
    namespace: text('namespace').notNull().default('common'),
    key: text('key').notNull(),
    type: text('type', {
      enum: ['string', 'number', 'boolean', 'json'],
    }).notNull(),
    value: text('value'),
    defaultValue: text('default_value'),
    label: text('label'),
    description: text('description'),
    isPublic: boolean('is_public').default(false).notNull(),
    isReadonly: boolean('is_readonly').default(false).notNull(),
    isSecret: boolean('is_secret').default(false).notNull(),
    enum: jsonb('enum').$type<string[] | null>(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedBy: integer('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [uniqueIndex('idx_namespace_key').on(t.namespace, t.key)],
)
