import { NextRequest } from 'next/server'
import { proxyAnalyzer } from '@/lib/analyzer-proxy'
export async function POST(request: NextRequest) { return proxyAnalyzer(request, 'explain') }
