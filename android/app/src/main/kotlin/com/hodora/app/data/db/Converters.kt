package com.hodora.app.data.db

import androidx.room.TypeConverter
import com.hodora.app.data.model.RidePoint
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class Converters {
    private val json = Json { ignoreUnknownKeys = true }

    @TypeConverter
    fun fromPoints(points: List<RidePoint>): String = json.encodeToString(points)

    @TypeConverter
    fun toPoints(data: String): List<RidePoint> =
        if (data.isBlank()) emptyList() else json.decodeFromString(data)
}
