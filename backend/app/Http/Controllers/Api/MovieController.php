<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Movie;
use App\Services\GeminiRecommendationService;
use Illuminate\Http\Request;

class MovieController extends Controller
{
    public function index(Request $request)
    {
        $query = Movie::query();

        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('director', 'like', "%{$search}%");
            });
        }

        if ($request->filled('genre')) {
            $genre = $request->string('genre')->toString();
            $query->whereJsonContains('genres', $genre);
        }

        if ($request->boolean('random')) {
            $query->inRandomOrder();
        } else {
            $query->orderBy('title');
        }

        return response()->json($query->get());
    }

    public function show(int $movie)
    {
        return response()->json(Movie::findOrFail($movie));
    }

    public function recommend(Request $request, GeminiRecommendationService $service)
    {
        $data = $request->validate([
            'prompt' => ['required', 'string', 'min:3', 'max:1000'],
        ]);

        try {
            return response()->json($service->recommend($data['prompt']));
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 502);
        }
    }
}
