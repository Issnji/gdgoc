<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Movie;
use App\Models\Watchlist;
use App\Http\Requests\StoreWatchlistRequest;
use Illuminate\Http\Request;
use Illuminate\Database\QueryException;

class WatchlistController extends Controller
{
    public function index(Request $request)
    {
        $items = Watchlist::with('movie')
            ->where('user_id', $request->user()->id)
            ->orderByDesc('created_at')->get();

        return response()->json($items->pluck('movie'));
    }

    public function store(StoreWatchlistRequest $request)
    {
        $userId = auth('api')->id();

        $exists = Watchlist::where('user_id', $userId)
            ->where('movie_id', $request->movieId)
            ->exists();

        if ($exists) {
            return response()->json([
                'message' => 'Film sudah ada di watchlist.',
            ], 409);
        }

        $watchlist = Watchlist::create([
            'user_id' => $userId,
            'movie_id' => $request->movieId,
        ]);

        return response()->json([
            'message' => 'Film berhasil ditambahkan.',
            'data' => $watchlist,
        ], 201);
    }

    public function destroy(Request $request, int $movieId)
    {
        $deleted = Watchlist::where('user_id', $request->user()->id)
            ->where('movie_id', $movieId)->delete();

        if (!$deleted) {
            return response()->json(['message' => 'Film tidak ditemukan di watchlist.'], 404);
        }

        return response()->json(['message' => 'Film dihapus dari watchlist.']);
    }
}
