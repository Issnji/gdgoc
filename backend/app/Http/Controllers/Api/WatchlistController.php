<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Watchlist;
use Illuminate\Http\Request;

class WatchlistController extends Controller
{
    // Menampilkan watchlist milik user yang login
    public function index()
    {
        $userId = auth('api')->id();

        $watchlist = Watchlist::with('movie')
            ->where('user_id', $userId)
            ->get();

        return response()->json([
            'message' => 'Watchlist berhasil diambil.',
            'data' => $watchlist
        ], 200);
    }

    // Menambahkan film ke watchlist
    public function store(Request $request)
    {
        $validated = $request->validate([
            'movieId' => 'required|integer|exists:movies,id',
        ]);

        $userId = auth('api')->id();

        // Periksa apakah film sudah ada di watchlist user
        $exists = Watchlist::where('user_id', $userId)
            ->where('movie_id', $validated['movieId'])
            ->exists();

        if ($exists) {
            return response()->json([
                'message' => 'Film sudah ada di watchlist.'
            ], 409);
        }

        $watchlist = Watchlist::create([
            'user_id' => $userId,
            'movie_id' => $validated['movieId'],
        ]);

        return response()->json([
            'message' => 'Film berhasil ditambahkan ke watchlist.',
            'data' => $watchlist
        ], 201);
    }

    // Menghapus film dari watchlist
    public function destroy($movie)
    {
        $userId = auth('api')->id();

        // Cari berdasarkan film terlebih dahulu
        $watchlist = Watchlist::where('movie_id', $movie)
            ->first();

        if (!$watchlist) {
            return response()->json([
                'message' => 'Data watchlist tidak ditemukan.'
            ], 404);
        }

        // Periksa kepemilikan data
        if ($watchlist->user_id != $userId) {
            return response()->json([
                'message' => 'Kamu tidak memiliki akses ke watchlist ini.'
            ], 403);
        }

        $watchlist->delete();

        return response()->json([
            'message' => 'Film berhasil dihapus dari watchlist.'
        ], 200);
    }
}