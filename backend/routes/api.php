<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\MovieController;
use App\Http\Controllers\Api\WatchlistController;
use App\Http\Controllers\Api\WatchedController;

Route::prefix('auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
});

Route::get('/movies', [MovieController::class, 'index']);
Route::get('/movies/{movie}', [MovieController::class, 'show'])
    ->whereNumber('movie');

Route::middleware('auth:api')->group(function () {

    Route::get('/watchlist', [WatchlistController::class, 'index']);
    Route::post('/watchlist', [WatchlistController::class, 'store']);
    Route::delete('/watchlist/{movie}', [WatchlistController::class, 'destroy'])
        ->whereNumber('movie');

    Route::get('/watched', [WatchedController::class, 'index']);
    Route::post('/watched', [WatchedController::class, 'store']);
    Route::delete('/watched/{movie}', [WatchedController::class, 'destroy'])
        ->whereNumber('movie');
});

Route::post('/movies/recommend', [MovieController::class, 'recommend']);