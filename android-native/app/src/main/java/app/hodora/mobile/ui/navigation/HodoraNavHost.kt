package app.hodora.mobile.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import app.hodora.mobile.ui.auth.AuthScreen
import app.hodora.mobile.ui.auth.AuthViewModel
import app.hodora.mobile.ui.cloud.CloudSyncScreen
import app.hodora.mobile.ui.explore.ExploreScreen
import app.hodora.mobile.ui.nav.NavScreen
import app.hodora.mobile.ui.plan.PlanScreen
import app.hodora.mobile.ui.record.RecordScreen
import app.hodora.mobile.ui.ridedetail.RideDetailScreen
import app.hodora.mobile.ui.rides.RidesListScreen
import app.hodora.mobile.ui.share.SharedRideScreen
import app.hodora.mobile.ui.wind.WindScreen
import io.github.jan.supabase.auth.status.SessionStatus

object HodoraDestination {
    const val AUTH = "auth"
    const val RIDES = "rides"
    const val PLAN = "plan"
    const val RECORD = "record"
    const val EXPLORE = "explore"
    const val WIND = "wind"
    const val CLOUD_SYNC = "cloud-sync"
    const val RIDE_ID_ARG = "rideId"
    const val RIDE_DETAIL = "rides/{$RIDE_ID_ARG}"
    const val NAV = "nav/{$RIDE_ID_ARG}"
    const val SHARE_TOKEN_ARG = "token"
    const val SHARE = "share/{$SHARE_TOKEN_ARG}"

    fun rideDetail(rideId: String) = "rides/$rideId"

    fun navigate(rideId: String) = "nav/$rideId"

    fun share(token: String) = "share/$token"
}

/**
 * [sharedRideId] comes from MainActivity's App Link handling (the
 * https://hodora.app/share/{token} intent, see AndroidManifest.xml) — when
 * set, the very first navigation decision below sends the rider straight to
 * that shared route instead of the normal sign-in gate, matching the web
 * share page being public/unauthenticated. Consumed once via
 * `handledSharedLink` so a later sign-in/sign-out during the same process
 * lifetime falls back to the normal auth-driven redirect.
 */
@Composable
fun HodoraNavHost(
    navController: NavHostController = rememberNavController(),
    sharedRideId: String? = null,
) {
    // Shared at the nav-host level (not per-screen) so sign-in on the auth
    // screen and sign-out from the rides screen both flow through the same
    // sessionStatus this composable watches to decide where to navigate.
    val authViewModel: AuthViewModel = viewModel()
    val sessionStatus by authViewModel.sessionStatus.collectAsState()
    var handledSharedLink by remember { mutableStateOf(false) }

    LaunchedEffect(sessionStatus) {
        if (sharedRideId != null && !handledSharedLink) {
            handledSharedLink = true
            navController.navigate(HodoraDestination.share(sharedRideId)) {
                popUpTo(0) { inclusive = true }
            }
            return@LaunchedEffect
        }
        // LoadingFromStorage / network-error states fall through and leave
        // the current screen as-is rather than bouncing the user.
        val destination =
            when (sessionStatus) {
                is SessionStatus.Authenticated -> HodoraDestination.RIDES
                is SessionStatus.NotAuthenticated -> HodoraDestination.AUTH
                else -> return@LaunchedEffect
            }
        navController.navigate(destination) {
            popUpTo(0) { inclusive = true }
            launchSingleTop = true
        }
    }

    NavHost(navController = navController, startDestination = HodoraDestination.AUTH) {
        composable(HodoraDestination.AUTH) {
            AuthScreen(viewModel = authViewModel)
        }
        composable(HodoraDestination.RIDES) {
            RidesListScreen(
                onSignOut = { authViewModel.signOut() },
                onOpenRide = { rideId -> navController.navigate(HodoraDestination.rideDetail(rideId)) },
                onPlanRoute = { navController.navigate(HodoraDestination.PLAN) },
                onRecordRide = { navController.navigate(HodoraDestination.RECORD) },
                onExplore = { navController.navigate(HodoraDestination.EXPLORE) },
                onWind = { navController.navigate(HodoraDestination.WIND) },
                onCloudSync = { navController.navigate(HodoraDestination.CLOUD_SYNC) },
            )
        }
        composable(
            route = HodoraDestination.RIDE_DETAIL,
            arguments = listOf(navArgument(HodoraDestination.RIDE_ID_ARG) { type = NavType.StringType }),
        ) { backStackEntry ->
            val rideId = backStackEntry.arguments?.getString(HodoraDestination.RIDE_ID_ARG).orEmpty()
            RideDetailScreen(
                rideId = rideId,
                onBack = { navController.popBackStack() },
                onNavigate = { navController.navigate(HodoraDestination.navigate(rideId)) },
            )
        }
        composable(
            route = HodoraDestination.NAV,
            arguments = listOf(navArgument(HodoraDestination.RIDE_ID_ARG) { type = NavType.StringType }),
        ) { backStackEntry ->
            val rideId = backStackEntry.arguments?.getString(HodoraDestination.RIDE_ID_ARG).orEmpty()
            NavScreen(rideId = rideId, onExit = { navController.popBackStack() })
        }
        composable(HodoraDestination.PLAN) {
            PlanScreen(
                onBack = { navController.popBackStack() },
                onSaved = { rideId ->
                    navController.navigate(HodoraDestination.rideDetail(rideId)) {
                        popUpTo(HodoraDestination.RIDES)
                    }
                },
            )
        }
        composable(HodoraDestination.RECORD) {
            RecordScreen(
                onSaved = { rideId ->
                    navController.navigate(HodoraDestination.rideDetail(rideId)) {
                        popUpTo(HodoraDestination.RIDES)
                    }
                },
                onExit = { navController.popBackStack() },
            )
        }
        composable(HodoraDestination.EXPLORE) {
            ExploreScreen(
                onBack = { navController.popBackStack() },
                onSaved = { rideId ->
                    navController.navigate(HodoraDestination.rideDetail(rideId)) {
                        popUpTo(HodoraDestination.RIDES)
                    }
                },
            )
        }
        composable(HodoraDestination.WIND) {
            WindScreen(onBack = { navController.popBackStack() })
        }
        composable(HodoraDestination.CLOUD_SYNC) {
            CloudSyncScreen(onBack = { navController.popBackStack() })
        }
        composable(
            route = HodoraDestination.SHARE,
            arguments = listOf(navArgument(HodoraDestination.SHARE_TOKEN_ARG) { type = NavType.StringType }),
        ) { backStackEntry ->
            val token = backStackEntry.arguments?.getString(HodoraDestination.SHARE_TOKEN_ARG).orEmpty()
            SharedRideScreen(
                token = token,
                onDone = {
                    // Route to auth or straight to the rides list depending
                    // on whether the visitor who tapped this link already
                    // has a session — a shared route is public, but "Open
                    // Hodora" from it isn't.
                    val destination =
                        if (sessionStatus is SessionStatus.Authenticated) HodoraDestination.RIDES else HodoraDestination.AUTH
                    navController.navigate(destination) {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
    }
}
