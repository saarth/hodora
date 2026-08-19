package app.hodora.mobile.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [OfflineRideEntity::class, MetaEntity::class], version = 1, exportSchema = false)
abstract class OfflineDatabase : RoomDatabase() {
    abstract fun dao(): OfflineDao
}
