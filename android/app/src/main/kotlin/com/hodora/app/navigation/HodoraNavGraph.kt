package com.hodora.app.navigation

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.hodora.app.ui.navigation.NavScreen
import com.hodora.app.ui.ridedetail.RideDetailScreen
import com.hodora.app.ui.rides.RidesListScreen
import com.hodora.app.ui.settings.SettingsScreen

private object Routes {
    const val RIDES = "rides"
    const val SETTINGS = "settings"
    const val RIDE_DETAIL = "rides/{rideId}"
    const val RIDE_NAV = "rides/{rideId}/nav"
    fun rideDetail(id: String) = "rides/$id"
    fun rideNav(id: String) = "rides/$id/nav"
}

@Composable
fun HodoraNavGraph(pendingGpxUri: Uri?, onGpxUriConsumed: () -> Unit) {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = Routes.RIDES) {
        composable(Routes.RIDES) {
            RidesListScreen(
                onRideClick = { id -> navController.navigate(Routes.rideDetail(id)) },
                onOpenSettings = { navController.navigate(Routes.SETTINGS) },
                pendingGpxUri = pendingGpxUri,
                onGpxUriConsumed = onGpxUriConsumed,
            )
        }
        composable(
            route = Routes.RIDE_DETAIL,
            arguments = listOf(navArgument("rideId") { type = NavType.StringType }),
        ) {
            RideDetailScreen(
                onBack = { navController.popBackStack() },
                onStartNavigation = { id -> navController.navigate(Routes.rideNav(id)) },
            )
        }
        composable(
            route = Routes.RIDE_NAV,
            arguments = listOf(navArgument("rideId") { type = NavType.StringType }),
        ) {
            NavScreen(onExit = { navController.popBackStack() })
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(onBack = { navController.popBackStack() })
        }
    }
}
