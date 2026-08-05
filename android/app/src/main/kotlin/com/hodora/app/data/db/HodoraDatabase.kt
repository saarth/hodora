package com.hodora.app.data.db

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(entities = [RideEntity::class], version = 1, exportSchema = false)
@TypeConverters(Converters::class)
abstract class HodoraDatabase : RoomDatabase() {
    abstract fun rideDao(): RideDao
}
